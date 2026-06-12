/**
 * Builds the Kysely dialect for a connection string. The dialect is the single
 * swap-point behind the persistence interface (ADR-0017 §1, §9):
 *
 *   - Postgres (cloud): first-party `PostgresDialect` over `pg`. Works with any
 *     Postgres, including Neon's pooler URL — Neon is one driver option, not a
 *     baked-in dependency.
 *   - SQLite (self-host): `LibsqlDialect` over libSQL — prebuilt binaries, no
 *     native compile on install (ADR-0017 §9).
 *
 * The returned `type` is Better Auth's `KyselyDatabaseType`, so the same
 * resolution drives both our Kysely instance and Better Auth's adapter.
 */
import { LibsqlDialect, type LibsqlDriver } from '@libsql/kysely-libsql';
import type { DatabaseConnection, Dialect, Driver, TransactionSettings } from 'kysely';
import { PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { type DatabaseBackend, inferBackend } from './config.js';

export type KyselyBackendType = 'sqlite' | 'postgres';

/**
 * How long SQLite waits on a locked database before returning `SQLITE_BUSY`.
 * The self-host pattern runs two writer processes against one file — the api
 * (auth/session/project) and the worker (graph replace) — so a brief wait lets
 * the short write locks clear instead of surfacing a transient error to a user
 * (ADR-0030 §4).
 */
const SQLITE_BUSY_TIMEOUT_MS = 5000;

/**
 * Decorates the libSQL driver to apply connection PRAGMAs exactly once, in
 * `init()` — the single hook Kysely awaits before any query runs, so this is
 * race-free. The `file:` client is a single connection, so one application
 * covers every subsequent query:
 *
 *   - `journal_mode = WAL`  — readers never block the writer and vice versa,
 *     the right mode for the api+worker self-host. WAL is persisted in the file
 *     header, so this is also effectively a one-time switch.
 *   - `busy_timeout`        — per-connection; absorbs the two-writer contention.
 *
 * Composition (not mutation) of the inner driver keeps libSQL's own
 * client-resolution untouched (ADR-0030 §4).
 */
class SqliteResilientDriver implements Driver {
  readonly #inner: LibsqlDriver;

  constructor(inner: LibsqlDriver) {
    this.#inner = inner;
  }

  async init(): Promise<void> {
    await this.#inner.init();
    await this.#inner.client.execute('PRAGMA journal_mode = WAL');
    await this.#inner.client.execute(`PRAGMA busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS}`);
  }

  acquireConnection(): Promise<DatabaseConnection> {
    return this.#inner.acquireConnection();
  }

  beginTransaction(connection: DatabaseConnection, settings: TransactionSettings): Promise<void> {
    return this.#inner.beginTransaction(connection as never, settings);
  }

  commitTransaction(connection: DatabaseConnection): Promise<void> {
    return this.#inner.commitTransaction(connection as never);
  }

  rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    return this.#inner.rollbackTransaction(connection as never);
  }

  releaseConnection(connection: DatabaseConnection): Promise<void> {
    return this.#inner.releaseConnection(connection as never);
  }

  destroy(): Promise<void> {
    return this.#inner.destroy();
  }
}

/**
 * A {@link LibsqlDialect} whose driver applies the SQLite resilience PRAGMAs
 * (ADR-0030 §4). Subclassing keeps it a `LibsqlDialect` for every other purpose.
 */
class SqliteResilientLibsqlDialect extends LibsqlDialect {
  override createDriver(): Driver {
    return new SqliteResilientDriver(super.createDriver() as LibsqlDriver);
  }
}

export interface ResolvedDialect {
  readonly dialect: Dialect;
  /** Better Auth's `database.type`, matching the chosen backend. */
  readonly type: KyselyBackendType;
  readonly backend: DatabaseBackend;
}

export function buildDialect(databaseUrl: string): ResolvedDialect {
  const backend = inferBackend(databaseUrl);
  if (backend === 'postgres') {
    return {
      dialect: new PostgresDialect({ pool: new Pool({ connectionString: databaseUrl }) }),
      type: 'postgres',
      backend,
    };
  }
  if (backend === 'sqlite') {
    return {
      dialect: new SqliteResilientLibsqlDialect({ url: databaseUrl }),
      type: 'sqlite',
      backend,
    };
  }
  throw new Error(
    `buildDialect: unrecognized DATABASE_URL scheme in "${databaseUrl}". ` +
      'Expected postgres://, postgresql://, libsql://, sqlite://, file:, or :memory:.',
  );
}
