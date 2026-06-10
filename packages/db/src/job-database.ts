/**
 * The job-persistence surface the queue depends on (ADR-0017 §1, ADR-0023 §6).
 * `createJobDatabase` builds a connection and hands back a {@link JobStore} plus a
 * close function, mirroring {@link createGraphDatabase} and
 * {@link createProjectDatabase}. The backend (SQLite self-host / Postgres cloud)
 * is selected by the DATABASE_URL scheme and passed to the store so the claim can
 * pick its dialect seam (ADR-0023 §2).
 *
 * `db` and `backend` are exposed for the explicit migrate step only — never to
 * migrate on boot (ADR-0008). Runtime callers use `jobStore` alone.
 */
import type { Kysely } from 'kysely';
import type { DatabaseBackend } from './config.js';
import { createDatabase } from './database.js';
import type { JobStore } from './repositories/job.repository.js';
import { KyselyJobStore } from './repositories/job.repository.kysely.js';
import type { JobDatabase } from './schema/job-types.js';

export interface JobDatabaseHandle {
  readonly jobStore: JobStore;
  /** The resolved backend — for an explicit `migrateToLatest` step. */
  readonly backend: DatabaseBackend;
  /** The underlying connection — for `migrateToLatest` only, never on boot. */
  readonly db: Kysely<JobDatabase>;
  /** Closes the underlying connection (call on shutdown). */
  close(): Promise<void>;
}

export function createJobDatabase(input: unknown): JobDatabaseHandle {
  const handle = createDatabase<JobDatabase>(input);
  return {
    jobStore: new KyselyJobStore(handle.db, handle.backend),
    backend: handle.backend,
    db: handle.db,
    close: () => handle.db.destroy(),
  };
}
