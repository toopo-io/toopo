/**
 * The queue job handler that closes the push→cartography loop (ADR-0025): for each
 * reference-only job, clone the repo at the commit into a sandbox, ingest the
 * content-hash delta (re-parse only changed files), and FULL-replace the project
 * graph — or no-op when nothing changed. Throwing propagates to the queue's
 * reliability (retry → dead-letter, ADR-0023); the sandbox is always cleaned up.
 *
 * The project already exists (B3 enqueues resolve-existing-only), so the handler
 * never creates tenancy — it persists under the job's `projectId` scope directly.
 * It composes packages only (apps stay thin); all pipeline/storage logic is theirs.
 */
import type { GraphRepository } from '@toopo/db';
import {
  buildTypescriptProjectModel,
  ingestDelta,
  loadWorkspacePackageDirs,
  type ParseFragmentCache,
} from '@toopo/ingest';
import { createReactPlugins, createReactResolver } from '@toopo/lang-react';
import type { ClaimedJob } from '@toopo/queue';
import type { RepoCloner } from '../clone/repo-cloner.js';
import { withSandbox } from '../clone/sandbox.js';

export interface IngestJobHandlerDeps {
  /** Clones the repo at the commit into the sandbox (ADR-0025 Decision 1). */
  readonly cloner: RepoCloner;
  /** The project-scoped graph store — read stored hashes, full-replace on change. */
  readonly graph: Pick<GraphRepository, 'getFileContentHashes' | 'replaceProjectGraph'>;
  /** The content-hash parse-fragment cache (ADR-0025 Decision 3). */
  readonly cache: ParseFragmentCache;
}

export function createIngestJobHandler(
  deps: IngestJobHandlerDeps,
): (job: ClaimedJob) => Promise<void> {
  return async (job: ClaimedJob): Promise<void> => {
    const { projectId, repo, commitSha } = job.reference;
    const scope = { projectId };

    await withSandbox(async (directory) => {
      await deps.cloner.clone({ repo, commitSha, destination: directory });

      const storedHashes = await deps.graph.getFileContentHashes(scope);
      const result = await ingestDelta(directory, {
        languagePlugins: createReactPlugins(),
        resolverPlugins: [createReactResolver()],
        buildProjectModel: (discovered) => buildTypescriptProjectModel(directory, discovered),
        buildPackageLayout: (rootDir) => loadWorkspacePackageDirs(rootDir),
        cache: deps.cache,
        storedHashes,
      });

      // 'unchanged' ⇒ the commit is already reflected (redelivery / retry): no write.
      if (result.status === 'ingested') {
        await deps.graph.replaceProjectGraph(scope, result.document);
      }
    });
  };
}
