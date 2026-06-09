/**
 * Dual-backend harness for the auth-flow e2e (ADR-0017 §6, F5). Mirrors the
 * internal harness in @toopo/db (not importable here — it is excluded from the
 * package build) so the auth flow can be exercised against a real SQLite (temp
 * libSQL file) and a real Postgres (testcontainer). Postgres runs whenever
 * Docker is available and is REQUIRED in CI, so a misconfigured runner fails
 * loudly rather than silently skipping the Postgres leg.
 */
import { execSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  type AuthDatabase,
  createDatabase,
  type DatabaseBackend,
  type KyselyBackendType,
  KyselyUserRepository,
  MIGRATIONS_DIR,
  migrateToLatest,
  type UserRepository,
} from '@toopo/db';
import type { Kysely } from 'kysely';

export interface AuthBackend {
  readonly backend: DatabaseBackend;
  readonly type: KyselyBackendType;
  readonly db: Kysely<AuthDatabase>;
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
  type: KyselyBackendType,
  cleanup: () => Promise<void>,
): Promise<AuthBackend> {
  const { db } = createDatabase<AuthDatabase>({ databaseUrl });
  await migrateToLatest({ db, backend, rootDir: MIGRATIONS_DIR });
  return { backend, type, db, repository: new KyselyUserRepository(db), cleanup };
}

async function startSqlite(): Promise<AuthBackend> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'toopo-auth-'));
  const file = path.join(dir, 'auth.db').split(path.sep).join('/');
  let handleDb: Kysely<AuthDatabase> | undefined;
  const backend = await migrated(`file:${file}`, 'sqlite', 'sqlite', async () => {
    await handleDb?.destroy();
    try {
      await rm(dir, { recursive: true, force: true });
    } catch {
      /* best-effort temp cleanup */
    }
  });
  handleDb = backend.db;
  return backend;
}

async function startPostgres(): Promise<AuthBackend> {
  const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
  const container = await new PostgreSqlContainer('postgres:17-alpine').start();
  let handleDb: Kysely<AuthDatabase> | undefined;
  const backend = await migrated(container.getConnectionUri(), 'postgres', 'postgres', async () => {
    await handleDb?.destroy();
    await container.stop();
  });
  handleDb = backend.db;
  return backend;
}

export function startAuthBackend(backend: DatabaseBackend): Promise<AuthBackend> {
  return backend === 'postgres' ? startPostgres() : startSqlite();
}
