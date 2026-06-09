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
import { LibsqlDialect } from '@libsql/kysely-libsql';
import type { Dialect } from 'kysely';
import { PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { type DatabaseBackend, inferBackend } from './config.js';

export type KyselyBackendType = 'sqlite' | 'postgres';

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
      dialect: new LibsqlDialect({ url: databaseUrl }),
      type: 'sqlite',
      backend,
    };
  }
  throw new Error(
    `buildDialect: unrecognized DATABASE_URL scheme in "${databaseUrl}". ` +
      'Expected postgres://, postgresql://, libsql://, sqlite://, file:, or :memory:.',
  );
}
