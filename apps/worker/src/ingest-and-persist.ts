/**
 * The worker's one job (ADR-0020 Fork 5): ingest a project directory into a
 * deterministic graph (the Parse → Resolve pipeline, @toopo/ingest) and persist
 * it (@toopo/db) — the minimal precursor to the future webhook/queue worker
 * (deferred to the queue ADR). It composes packages only; it holds no pipeline
 * or storage logic of its own, and it never names Kysely (fork F4).
 *
 * The database must already be migrated (`db:migrate`, ADR-0008 — never on boot).
 */
import { createGraphDatabase, type PersistGraphResult } from '@toopo/db';
import { buildTypescriptProjectModel, ingestProject } from '@toopo/ingest';
import { createReactPlugins, createReactResolver } from '@toopo/lang-react';

export interface IngestAndPersistOptions {
  /** The project directory to ingest. */
  readonly rootDir: string;
  /** The target database (scheme selects the backend, ADR-0017 §1). */
  readonly databaseUrl: string;
  /** Honor `.gitignore` during discovery. Defaults to true. */
  readonly gitignore?: boolean;
}

export interface IngestAndPersistResult {
  /** Distinct nodes/edges written (idempotent upsert, ADR-0015 §11). */
  readonly persisted: PersistGraphResult;
  /** Files the pipeline discovered and processed. */
  readonly files: number;
  /** Resolver diagnostics (unresolved/ambiguous) — surfaced, never hidden. */
  readonly diagnostics: number;
}

/** Ingest `rootDir` with the TS/React plugins and persist the graph to `databaseUrl`. */
export async function ingestAndPersist(
  options: IngestAndPersistOptions,
): Promise<IngestAndPersistResult> {
  const ingestion = await ingestProject(options.rootDir, {
    languagePlugins: createReactPlugins(),
    resolverPlugins: [createReactResolver()],
    buildProjectModel: (discovered) => buildTypescriptProjectModel(options.rootDir, discovered),
    gitignore: options.gitignore ?? true,
  });

  const handle = createGraphDatabase({ databaseUrl: options.databaseUrl });
  try {
    const persisted = await handle.graphRepository.persistGraph(ingestion.document);
    return {
      persisted,
      files: ingestion.files.length,
      diagnostics: ingestion.diagnostics.length,
    };
  } finally {
    await handle.close();
  }
}
