/**
 * Dual-backend harness that yields a DATABASE_URL (ADR-0017 §6) — unlike the db
 * package's harness, the worker e2e needs the URL itself, to build several handles
 * (queue, graph, parse-cache) that share ONE database. SQLite is a temp file;
 * Postgres is a throwaway testcontainer (required in CI, skipped locally without
 * Docker). Not under `src/`, so excluded from build and coverage.
 */
import { execSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseDatabaseConfig } from '@toopo/db';

function dockerAvailable(): boolean {
  try {
    execSync('docker info', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export const SKIP_POSTGRES = !dockerAvailable() && process.env['CI'] !== 'true';

export interface BackendUrl {
  readonly databaseUrl: string;
  cleanup(): Promise<void>;
}

async function sqliteUrl(): Promise<BackendUrl> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'worker-e2e-'));
  const file = path.join(dir, 'test.db').split(path.sep).join('/');
  return {
    databaseUrl: `file:${file}`,
    async cleanup() {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    },
  };
}

async function postgresUrl(): Promise<BackendUrl> {
  const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
  const container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const { databaseUrl } = parseDatabaseConfig({ databaseUrl: container.getConnectionUri() });
  return {
    databaseUrl,
    async cleanup() {
      await container.stop();
    },
  };
}

export function startBackendUrl(backend: 'sqlite' | 'postgres'): Promise<BackendUrl> {
  return backend === 'postgres' ? postgresUrl() : sqliteUrl();
}
