/**
 * The createJobDatabase factory (ADR-0023 §6). Proves it yields a working
 * JobStore over a real migrated connection (the queue's Kysely-free surface) and
 * that close releases it. SQLite is sufficient here; the claim seam itself is
 * exercised dual-backend in job.repository.spec.ts.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createJobDatabase, type JobDatabaseHandle } from './job-database.js';
import { MIGRATIONS_DIR } from './migrations-dir.js';
import { migrateToLatest } from './migrator.js';

const T0 = new Date('2026-06-10T00:00:00.000Z');

describe('createJobDatabase', () => {
  let dir: string;
  let handle: JobDatabaseHandle;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'toopo-jobdb-'));
    const file = path.join(dir, 'job.db').split(path.sep).join('/');
    handle = createJobDatabase({ databaseUrl: `file:${file}` });
    await migrateToLatest({ db: handle.db, backend: handle.backend, rootDir: MIGRATIONS_DIR });
  }, 60_000);

  afterAll(async () => {
    await handle.close();
    try {
      await rm(dir, { recursive: true, force: true });
    } catch {
      /* best-effort temp cleanup */
    }
  });

  it('resolves the SQLite backend from the file scheme', () => {
    expect(handle.backend).toBe('sqlite');
  });

  it('exposes a JobStore that enqueues and claims', async () => {
    const { id } = await handle.jobStore.enqueue(
      {
        dedupeKey: null,
        projectId: 'proj-jobdb',
        repoHost: 'github.com',
        repoOwner: 'toopo',
        repoName: 'toopo',
        commitSha: 'c'.repeat(40),
        availableAt: T0,
      },
      T0,
    );
    const claimed = await handle.jobStore.claim({ leaseMs: 1_000, now: T0 });
    expect(claimed?.id).toBe(id);
    expect(claimed?.attempts).toBe(1);
  });
});
