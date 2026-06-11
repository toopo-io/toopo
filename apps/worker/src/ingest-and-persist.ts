/**
 * The worker's one job (ADR-0020 Fork 5): ingest a project directory into a
 * deterministic graph (the Parse → Resolve pipeline, @toopo/ingest) and persist
 * it (@toopo/db) — the minimal precursor to the future webhook/queue worker
 * (deferred to the queue ADR). It composes packages only; it holds no pipeline
 * or storage logic of its own, and it never names Kysely (fork F4).
 *
 * The database must already be migrated (`db:migrate`, ADR-0008 — never on boot).
 */
import {
  createAuthDatabase,
  createGraphDatabase,
  createProjectDatabase,
  type PersistGraphResult,
  type ProjectRepository,
} from '@toopo/db';
import {
  buildTypescriptProjectModel,
  ingestProject,
  loadWorkspacePackageDirs,
} from '@toopo/ingest';
import { createReactPlugins, createReactResolver } from '@toopo/lang-react';

export interface IngestAndPersistOptions {
  /** The project directory to ingest. */
  readonly rootDir: string;
  /** The target database (scheme selects the backend, ADR-0017 §1). */
  readonly databaseUrl: string;
  /** Honor `.gitignore` during discovery. Defaults to true. */
  readonly gitignore?: boolean;
  /** The connected repo the graph is persisted under (ADR-0022 §3). */
  readonly repo: {
    readonly host: string;
    readonly owner: string;
    readonly name: string;
  };
  /** The user the project is attributed to on first connect (ADR-0022 §1, §2). */
  readonly ownerUserId: string;
  /** The workspace the project is attributed to on first connect (ADR-0028). */
  readonly workspaceId: string;
}

export interface IngestAndPersistResult {
  /** The project the graph was persisted under (resolved or created). */
  readonly projectId: string;
  /** Whether the project was created on this run (vs an existing one re-ingested). */
  readonly projectCreated: boolean;
  /** Distinct nodes/edges written (idempotent upsert, ADR-0015 §11). */
  readonly persisted: PersistGraphResult;
  /** Files the pipeline discovered and processed. */
  readonly files: number;
  /** Resolver diagnostics (unresolved/ambiguous) — surfaced, never hidden. */
  readonly diagnostics: number;
}

/**
 * Resolve the project for the repo triple, creating it on first connect
 * (idempotent on the per-instance repo unique index, ADR-0022 F-E). Returns the
 * project id and whether it was freshly created.
 */
async function resolveProject(
  projects: ProjectRepository,
  options: IngestAndPersistOptions,
): Promise<{ readonly projectId: string; readonly created: boolean }> {
  const { host, owner, name } = options.repo;
  const existing = await projects.findProjectByRepo(host, owner, name);
  if (existing !== null) {
    return { projectId: existing.id, created: false };
  }
  const created = await projects.createProject({
    ownerUserId: options.ownerUserId,
    workspaceId: options.workspaceId,
    repoHost: host,
    repoOwner: owner,
    repoName: name,
  });
  return { projectId: created.id, created: true };
}

/**
 * Confirm the target workspace exists before attributing a project to it
 * (ADR-0028): the worker cannot create workspaces (Better Auth owns organization
 * writes), so an unreal `--workspace-id` would silently produce a project no one
 * can reach under membership-scoped access (Phase 3). Fail loud instead.
 */
async function assertWorkspaceExists(databaseUrl: string, workspaceId: string): Promise<void> {
  const auth = createAuthDatabase({ databaseUrl });
  try {
    if (!(await auth.workspaceRepository.exists(workspaceId))) {
      throw new Error(
        `Workspace "${workspaceId}" does not exist. The worker cannot create workspaces ` +
          '(Better Auth owns organization writes); pass an existing --workspace-id.',
      );
    }
  } finally {
    await auth.close();
  }
}

/**
 * Ingest `rootDir` with the TS/React plugins and persist the graph under the
 * repo's project (resolve-or-create), scoped by `projectId` (ADR-0022 §3). The
 * database must already be migrated (`db:migrate`, ADR-0008 — never on boot).
 */
export async function ingestAndPersist(
  options: IngestAndPersistOptions,
): Promise<IngestAndPersistResult> {
  // Validate the workspace up front — a cheap read that avoids a wasted parse and
  // guarantees the project we are about to create is reachable (ADR-0028).
  await assertWorkspaceExists(options.databaseUrl, options.workspaceId);

  const ingestion = await ingestProject(options.rootDir, {
    languagePlugins: createReactPlugins(),
    resolverPlugins: [createReactResolver()],
    buildProjectModel: (discovered) => buildTypescriptProjectModel(options.rootDir, discovered),
    buildPackageLayout: (rootDir) => loadWorkspacePackageDirs(rootDir),
    gitignore: options.gitignore ?? true,
  });

  const projectHandle = createProjectDatabase({ databaseUrl: options.databaseUrl });
  const graphHandle = createGraphDatabase({ databaseUrl: options.databaseUrl });
  try {
    const { projectId, created } = await resolveProject(projectHandle.projectRepository, options);
    const persisted = await graphHandle.graphRepository.persistGraph(
      { projectId },
      ingestion.document,
      ingestion.diagnostics,
    );
    return {
      projectId,
      projectCreated: created,
      persisted,
      files: ingestion.files.length,
      diagnostics: ingestion.diagnostics.length,
    };
  } finally {
    await Promise.all([projectHandle.close(), graphHandle.close()]);
  }
}
