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
import type { GraphRepository, ProjectRepository } from '@toopo/db';
import type { GithubAppAuth } from '@toopo/github-app';
import {
  buildTypescriptProjectModel,
  ingestDelta,
  loadWorkspacePackageDirs,
  type ParseFragmentCache,
} from '@toopo/ingest';
import { createReactPlugins, createReactResolver } from '@toopo/lang-react';
import { CANONICAL_REPO_HOST, type ClaimedJob } from '@toopo/queue';
import type { CloneCredentials } from '../clone/git-askpass.js';
import type { RepoCloner } from '../clone/repo-cloner.js';
import { withSandbox } from '../clone/sandbox.js';

/** Mints installation tokens — the subset of {@link GithubAppAuth} this handler uses. */
export type InstallationTokenMinter = Pick<GithubAppAuth, 'mintInstallationToken'>;

export interface IngestJobHandlerDeps {
  /** Clones the repo at the commit into the sandbox (ADR-0025 Decision 1). */
  readonly cloner: RepoCloner;
  /** The project-scoped graph store — read stored hashes, full-replace on change. */
  readonly graph: Pick<GraphRepository, 'getFileContentHashes' | 'replaceProjectGraph'>;
  /** The content-hash parse-fragment cache (ADR-0025 Decision 3). */
  readonly cache: ParseFragmentCache;
  /** Resolves the project's installation id for a private clone (ADR-0026 §5). */
  readonly projects?: Pick<ProjectRepository, 'findProjectById'>;
  /** Mints the installation token; `null`/absent ⇒ public clone only (fail-closed). */
  readonly tokenMinter?: InstallationTokenMinter | null;
}

/**
 * Resolve clone credentials for a private repo (ADR-0026 §5): project →
 * installation id → a freshly minted installation token. Returns `undefined` (a
 * public clone) when the App is unconfigured, the deps are absent, or the project
 * has no installation id — so a public repo, or a self-host with no App, clones
 * exactly as in B4.
 */
async function resolveCredentials(
  deps: IngestJobHandlerDeps,
  projectId: string,
): Promise<CloneCredentials | undefined> {
  if (deps.projects === undefined || deps.tokenMinter === undefined || deps.tokenMinter === null) {
    return undefined;
  }
  const project = await deps.projects.findProjectById(projectId);
  if (project === null || project.installationId === null) {
    return undefined;
  }
  const token = await deps.tokenMinter.mintInstallationToken(Number(project.installationId));
  return { username: 'x-access-token', password: token.token };
}

export function createIngestJobHandler(
  deps: IngestJobHandlerDeps,
): (job: ClaimedJob) => Promise<void> {
  return async (job: ClaimedJob): Promise<void> => {
    const { projectId, repo, commitSha } = job.reference;
    if (repo.host !== CANONICAL_REPO_HOST) {
      // Defense-in-depth (ADR-0025 §7): the schema pins the host at enqueue AND
      // claim; even a row that somehow bypassed both must never receive an
      // installation token or drive a clone.
      throw new Error(`refusing to clone from non-canonical host: ${repo.host}`);
    }
    const scope = { projectId };

    await withSandbox(async (directory) => {
      const credentials = await resolveCredentials(deps, projectId);
      await deps.cloner.clone({
        repo,
        commitSha,
        destination: directory,
        ...(credentials !== undefined ? { credentials } : {}),
      });

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
        // Persist the unresolved tail with the graph in one transaction (C11), so a
        // later "unused"/"cycle" view never reads a resolution gap as absence.
        await deps.graph.replaceProjectGraph(scope, result.document, result.diagnostics);
      }
    });
  };
}
