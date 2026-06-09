/**
 * Dual-backend harness for the auth-flow e2e (ADR-0017 §6, F5). Mirrors the
 * internal harness in @toopo/db (not importable here — it is excluded from the
 * package build) so the auth flow can be exercised against a real SQLite (temp
 * libSQL file) and a real Postgres (testcontainer). Postgres runs whenever
 * Docker is available and is REQUIRED in CI, so a misconfigured runner fails
 * loudly rather than silently skipping the Postgres leg.
 *
 * Everything comes from @toopo/db's surface (fork F4) — no Kysely here.
 */
import { execSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  type BetterAuthDatabase,
  createAuthDatabase,
  type DatabaseBackend,
  MIGRATIONS_DIR,
  migrateToLatest,
  type UserRepository,
} from '@toopo/db';

export interface AuthBackend {
  readonly backend: DatabaseBackend;
  readonly betterAuthDatabase: BetterAuthDatabase;
  readonly repository: UserRepository;
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

export const SKIP_POSTGRES = !isDockerAvailable() && process.env['CI'] !== 'true';

async function migrated(
  databaseUrl: string,
  backend: DatabaseBackend,
  extraCleanup: () => Promise<unknown>,
): Promise<AuthBackend> {
  const handle = createAuthDatabase({ databaseUrl });
  await migrateToLatest({ db: handle.betterAuthDatabase.db, backend, rootDir: MIGRATIONS_DIR });
  return {
    backend,
    betterAuthDatabase: handle.betterAuthDatabase,
    repository: handle.userRepository,
    async cleanup() {
      await handle.close();
      await extraCleanup();
    },
  };
}

async function startSqlite(): Promise<AuthBackend> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'toopo-auth-'));
  const file = path.join(dir, 'auth.db').split(path.sep).join('/');
  return migrated(`file:${file}`, 'sqlite', async () => {
    try {
      await rm(dir, { recursive: true, force: true });
    } catch {
      /* best-effort temp cleanup */
    }
  });
}

async function startPostgres(): Promise<AuthBackend> {
  const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
  const container = await new PostgreSqlContainer('postgres:17-alpine').start();
  return migrated(container.getConnectionUri(), 'postgres', () => container.stop());
}

export function startAuthBackend(backend: DatabaseBackend): Promise<AuthBackend> {
  return backend === 'postgres' ? startPostgres() : startSqlite();
}
