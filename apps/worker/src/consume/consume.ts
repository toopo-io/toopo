/**
 * The worker's long-lived consume mode (ADR-0025 Decision 6): drain the queue one
 * job at a time, cloning + ingesting + persisting each via {@link createIngestJobHandler}.
 * One job per process — the queue is the scaling seam (more processes = more
 * throughput; Postgres `FOR UPDATE SKIP LOCKED` hands them distinct jobs, SQLite
 * self-host runs one writer). It composes the queue, graph store, parse cache, and
 * cloner; the DB must already be migrated (`db:migrate`, ADR-0008 — never on boot).
 *
 * `shutdown()` is graceful: stop claiming, await the in-flight job (drain), then
 * close every connection — so a clean stop never severs a running job.
 */
import { createGraphDatabase, createParseFragmentDatabase, createProjectDatabase } from '@toopo/db';
import type { GithubAppAuth } from '@toopo/github-app';
import { createQueue } from '@toopo/queue';
import { GitCloner } from '../clone/git-cloner.js';
import type { RepoCloner } from '../clone/repo-cloner.js';
import { withDrainTracking } from './drain.js';
import { createIngestJobHandler } from './ingest-job-handler.js';
import { resolveWorkerGithubAppAuth } from './worker-github-app.js';

export interface ConsumeOptions {
  /** The target database (scheme selects the backend, ADR-0017 §1). */
  readonly databaseUrl: string;
  /** Override the cloner (tests inject a fixture/fake). Defaults to native git. */
  readonly cloner?: RepoCloner;
  /**
   * Override the installation-token minter (tests). Defaults to resolving the
   * GitHub App from the environment, or `null` (public clone only) when unset.
   */
  readonly tokenMinter?: GithubAppAuth | null;
  /** One-line structured log sink. Defaults to stderr. */
  readonly log?: (line: string) => void;
}

export interface ConsumeHandle {
  /** Stop claiming, wait for the in-flight job, then close all connections. */
  shutdown(): Promise<void>;
}

function stderrLog(line: string): void {
  process.stderr.write(`${line}\n`);
}

export function startConsume(options: ConsumeOptions): ConsumeHandle {
  const log = options.log ?? stderrLog;
  const queueHandle = createQueue({ databaseUrl: options.databaseUrl });
  const graphHandle = createGraphDatabase({ databaseUrl: options.databaseUrl });
  const cacheHandle = createParseFragmentDatabase({ databaseUrl: options.databaseUrl });
  const projectHandle = createProjectDatabase({ databaseUrl: options.databaseUrl });
  const cloner = options.cloner ?? new GitCloner();
  const tokenMinter =
    options.tokenMinter !== undefined
      ? options.tokenMinter
      : resolveWorkerGithubAppAuth(process.env);

  const baseHandler = createIngestJobHandler({
    cloner,
    graph: graphHandle.graphRepository,
    cache: cacheHandle.parseFragmentStore,
    projects: projectHandle.projectRepository,
    tokenMinter,
  });
  const { handler, drain } = withDrainTracking(baseHandler);
  log(
    `[worker] github app auth: ${tokenMinter === null ? 'disabled (public clone only)' : 'enabled'}`,
  );

  const consumer = queueHandle.createConsumer({
    handler,
    onDeadLetter: (job, error) =>
      log(
        `[worker] dead-letter job=${job.id} project=${job.reference.projectId} commit=${job.reference.commitSha}: ${error}`,
      ),
    onError: (error) =>
      log(`[worker] infra error: ${error instanceof Error ? error.message : String(error)}`),
  });
  const subscription = consumer.start();
  log(`[worker] consuming (backend=${queueHandle.backend})`);

  return {
    async shutdown(): Promise<void> {
      subscription.stop();
      await drain();
      await Promise.all([
        queueHandle.close(),
        graphHandle.close(),
        cacheHandle.close(),
        projectHandle.close(),
      ]);
      log('[worker] stopped');
    },
  };
}
