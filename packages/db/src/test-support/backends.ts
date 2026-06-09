/**
 * Dual-backend test harness (ADR-0017 §6, F5). Exercises the suite against both
 * real backends: libSQL in-memory for SQLite and a throwaway testcontainer for
 * Postgres. Shared by the migrator, repository, and auth-flow specs.
 *
 * Postgres runs whenever Docker is available. In CI it is REQUIRED — the suite
 * does not skip when `CI` is set, so a misconfigured runner fails loudly rather
 * than silently passing without the Postgres leg.
 *
 * Not shipped: excluded from the build and from coverage.
 */
import { execSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Kysely } from 'kysely';
import { type DatabaseBackend, parseDatabaseConfig } from '../config.js';
import { createDatabase, type ToopoDatabase } from '../database.js';

export interface BackendHarness {
  readonly backend: DatabaseBackend;
  readonly handle: ToopoDatabase<unknown>;
  readonly db: Kysely<unknown>;
  cleanup(): Promise<void>;
}

function isDockerAvailable(): boolean {
  try {
    execSync('docker info', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const inCI = process.env['CI'] === 'true';
const dockerAvailable = isDockerAvailable();

/** When true, the Postgres suite is skipped (local dev without Docker only). */
export const SKIP_POSTGRES = !dockerAvailable && !inCI;

if (SKIP_POSTGRES) {
  process.stderr.write(
    '[db tests] Postgres backend skipped — Docker is unavailable (set CI=true to require it).\n',
  );
}

async function startSqlite(): Promise<BackendHarness> {
  // A temp FILE, not :memory: — libSQL gives each connection its own in-memory
  // database, so a transaction (which opens a separate connection) would not see
  // tables created on another. A file is shared across connections and mirrors
  // the production self-host layout (one SQLite file).
  const dir = await mkdtemp(path.join(os.tmpdir(), 'toopo-db-'));
  const file = path.join(dir, 'test.db').split(path.sep).join('/');
  const handle = createDatabase({ databaseUrl: `file:${file}` });
  return {
    backend: 'sqlite',
    handle,
    db: handle.db,
    async cleanup() {
      await handle.db.destroy();
      // Best-effort: Windows may briefly hold the file handle after destroy;
      // the OS reclaims the temp dir regardless.
      try {
        await rm(dir, { recursive: true, force: true });
      } catch {
        /* temp file cleanup is non-critical */
      }
    },
  };
}

async function startPostgres(): Promise<BackendHarness> {
  // Imported lazily so SQLite-only local runs never load testcontainers.
  const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
  const container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const { databaseUrl } = parseDatabaseConfig({ databaseUrl: container.getConnectionUri() });
  const handle = createDatabase({ databaseUrl });
  return {
    backend: 'postgres',
    handle,
    db: handle.db,
    async cleanup() {
      await handle.db.destroy();
      await container.stop();
    },
  };
}

export function startBackend(backend: DatabaseBackend): Promise<BackendHarness> {
  return backend === 'postgres' ? startPostgres() : startSqlite();
}
