/**
 * The graph-persistence surface apps depend on (ADR-0017 §1: the app
 * never touches Kysely). `createGraphDatabase` builds a connection and hands
 * back a {@link GraphRepository} plus a close function, mirroring
 * {@link createAuthDatabase}. The backend (SQLite self-host / Postgres cloud) is
 * selected by the DATABASE_URL scheme.
 *
 * `db` and `backend` are exposed for the explicit migrate step only (the
 * `db:migrate` bin and tests) — never to migrate on boot (ADR-0008). Runtime
 * callers (the Serve API, the worker) use `graphRepository` alone.
 */
import type { Kysely } from 'kysely';
import type { DatabaseBackend } from './config.js';
import { createDatabase } from './database.js';
import type { GraphRepository } from './repositories/graph.repository.js';
import { KyselyGraphRepository } from './repositories/graph.repository.kysely.js';
import type { GraphDatabase } from './schema/graph-types.js';

export interface GraphDatabaseHandle {
  readonly graphRepository: GraphRepository;
  /** The resolved backend — for an explicit `migrateToLatest` step. */
  readonly backend: DatabaseBackend;
  /** The underlying connection — for `migrateToLatest` only, never on boot. */
  readonly db: Kysely<GraphDatabase>;
  /** Closes the underlying connection (call on shutdown). */
  close(): Promise<void>;
}

export function createGraphDatabase(input: unknown): GraphDatabaseHandle {
  const handle = createDatabase<GraphDatabase>(input);
  return {
    graphRepository: new KyselyGraphRepository(handle.db),
    backend: handle.backend,
    db: handle.db,
    close: () => handle.db.destroy(),
  };
}
