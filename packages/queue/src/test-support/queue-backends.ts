/**
 * Dual-backend test harness for the queue's cross-backend proofs (ADR-0023). It
 * provisions a migrated database on each backend — libSQL temp file for SQLite, a
 * throwaway testcontainer for Postgres — by reusing `@toopo/db`'s committed
 * migrator (`migrateToLatest` + `MIGRATIONS_DIR`), so the queue never
 * re-implements migration or schema knowledge. `createQueue` then opens its own
 * connection against the returned URL, exactly as production does.
 *
 * It keeps a separate ADMIN connection (a {@link JobStore} plus a reset) on the
 * same database, for inspecting dead letters and clearing state between tests.
 *
 * Postgres runs whenever Docker is available; in CI it is REQUIRED (no silent
 * skip when `CI` is set). Not shipped: excluded from the build and from coverage.
 */
import { execSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  createJobDatabase,
  type DatabaseBackend,
  type JobDatabaseHandle,
  type JobStore,
  MIGRATIONS_DIR,
  migrateToLatest,
} from '@toopo/db';

export interface QueueBackendHarness {
  readonly backend: DatabaseBackend;
  readonly databaseUrl: string;
  /** An admin store on the same database — for inspecting dead letters in tests. */
  readonly jobStore: JobStore;
  /** Clear all jobs between tests so the global claim scan stays isolated. */
  reset(): Promise<void>;
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
    '[queue tests] Postgres backend skipped — Docker is unavailable (set CI=true to require it).\n',
  );
}

function adminFor(handle: JobDatabaseHandle): Pick<QueueBackendHarness, 'jobStore' | 'reset'> {
  return {
    jobStore: handle.jobStore,
    reset: async () => {
      await handle.db.deleteFrom('job').execute();
    },
  };
}

async function startSqlite(): Promise<QueueBackendHarness> {
  // A temp FILE, not :memory: — libSQL gives each connection its own in-memory
  // database, so the queue's own connection would not see the migrated schema.
  const dir = await mkdtemp(path.join(os.tmpdir(), 'toopo-queue-'));
  const file = path.join(dir, 'queue.db').split(path.sep).join('/');
  const databaseUrl = `file:${file}`;
  const admin = createJobDatabase({ databaseUrl });
  await migrateToLatest({ db: admin.db, backend: admin.backend, rootDir: MIGRATIONS_DIR });
  return {
    backend: 'sqlite',
    databaseUrl,
    ...adminFor(admin),
    async cleanup() {
      await admin.close();
      try {
        await rm(dir, { recursive: true, force: true });
      } catch {
        /* temp file cleanup is non-critical */
      }
    },
  };
}

async function startPostgres(): Promise<QueueBackendHarness> {
  const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
  const container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const databaseUrl = container.getConnectionUri();
  const admin = createJobDatabase({ databaseUrl });
  await migrateToLatest({ db: admin.db, backend: admin.backend, rootDir: MIGRATIONS_DIR });
  return {
    backend: 'postgres',
    databaseUrl,
    ...adminFor(admin),
    async cleanup() {
      await admin.close();
      await container.stop();
    },
  };
}

export function startQueueBackend(backend: DatabaseBackend): Promise<QueueBackendHarness> {
  return backend === 'postgres' ? startPostgres() : startSqlite();
}
