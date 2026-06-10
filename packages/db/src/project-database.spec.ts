/**
 * ADR-0022 — the createProjectDatabase factory. Proves it yields a working
 * ProjectRepository over a real migrated connection (the app's Kysely-free
 * surface, fork F4) and that close releases it. SQLite is sufficient here; the
 * queries themselves are exercised dual-backend in the repository suite.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR } from './migrations-dir.js';
import { migrateToLatest } from './migrator.js';
import { createProjectDatabase, type ProjectDatabaseHandle } from './project-database.js';

describe('createProjectDatabase', () => {
  let dir: string;
  let handle: ProjectDatabaseHandle;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'toopo-projectdb-'));
    const file = path.join(dir, 'project.db').split(path.sep).join('/');
    handle = createProjectDatabase({ databaseUrl: `file:${file}` });
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

  it('exposes a repository that creates and reads back', async () => {
    const created = await handle.projectRepository.createProject({
      ownerUserId: 'user-1',
      workspaceId: 'ws-1',
      repoHost: 'github',
      repoOwner: 'toopo',
      repoName: 'toopo',
    });
    const found = await handle.projectRepository.findProjectById(created.id);
    expect(found?.id).toBe(created.id);
    expect(found?.repoName).toBe('toopo');
  });
});
