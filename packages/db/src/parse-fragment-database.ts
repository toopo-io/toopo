/**
 * The parse-fragment cache surface the worker depends on (ADR-0017 §1, ADR-0025
 * Decision 3). `createParseFragmentDatabase` builds a connection and hands back a
 * {@link ParseFragmentStore} plus a close function, mirroring
 * {@link createJobDatabase} and {@link createGraphDatabase}. The backend is
 * selected by the DATABASE_URL scheme.
 *
 * `db` and `backend` are exposed for the explicit migrate step only — never to
 * migrate on boot (ADR-0008). Runtime callers use `parseFragmentStore` alone.
 */
import type { Kysely } from 'kysely';
import type { DatabaseBackend } from './config.js';
import { createDatabase } from './database.js';
import type { ParseFragmentStore } from './repositories/parse-fragment.repository.js';
import { KyselyParseFragmentStore } from './repositories/parse-fragment.repository.kysely.js';
import type { ParseFragmentDatabase } from './schema/parse-fragment-types.js';

export interface ParseFragmentDatabaseHandle {
  readonly parseFragmentStore: ParseFragmentStore;
  /** The resolved backend — for an explicit `migrateToLatest` step. */
  readonly backend: DatabaseBackend;
  /** The underlying connection — for `migrateToLatest` only, never on boot. */
  readonly db: Kysely<ParseFragmentDatabase>;
  /** Closes the underlying connection (call on shutdown). */
  close(): Promise<void>;
}

export function createParseFragmentDatabase(input: unknown): ParseFragmentDatabaseHandle {
  const handle = createDatabase<ParseFragmentDatabase>(input);
  return {
    parseFragmentStore: new KyselyParseFragmentStore(handle.db),
    backend: handle.backend,
    db: handle.db,
    close: () => handle.db.destroy(),
  };
}
