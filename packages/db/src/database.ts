/**
 * The persistence entrypoint (ADR-0017 §1): one factory that returns a typed
 * Kysely instance over the backend selected by the DATABASE_URL scheme.
 * Switching self-host SQLite <-> cloud Postgres is purely a config change.
 *
 * The same Kysely instance is shared by Better Auth's Kysely adapter and our
 * repositories, so auth and application queries run on one connection.
 */
import { Kysely } from 'kysely';
import { type DatabaseBackend, parseDatabaseConfig } from './config.js';
import { buildDialect, type KyselyBackendType } from './dialect.js';

export interface ToopoDatabase<DB> {
  readonly db: Kysely<DB>;
  readonly backend: DatabaseBackend;
  /** Better Auth's `database.type` for this backend. */
  readonly type: KyselyBackendType;
}

/**
 * Validates the config at the boundary (ADR-0006) and constructs the Kysely
 * instance. Construction is lazy — no socket opens until the first query — so
 * this is safe to call at module wiring time.
 */
export function createDatabase<DB = unknown>(input: unknown): ToopoDatabase<DB> {
  const config = parseDatabaseConfig(input);
  const { dialect, type, backend } = buildDialect(config.databaseUrl);
  return { db: new Kysely<DB>({ dialect }), backend, type };
}
