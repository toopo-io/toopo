/**
 * ADR-0020 Phase C — the createGraphDatabase factory. Proves it yields a working
 * GraphRepository over a real migrated connection (the app's Kysely-free surface,
 * fork F4) and that close releases it. SQLite is sufficient here; the queries
 * themselves are exercised dual-backend in the repository suites.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FORMAT_VERSION, type GraphDocument } from '@toopo/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createGraphDatabase, type GraphDatabaseHandle } from './graph-database.js';
import { MIGRATIONS_DIR } from './migrations-dir.js';
import { migrateToLatest } from './migrator.js';

const document: GraphDocument = {
  formatVersion: FORMAT_VERSION,
  nodes: [{ kind: 'symbol', id: 'sA', name: 'Widget', properties: {} }],
  edges: [],
};

describe('createGraphDatabase', () => {
  let dir: string;
  let handle: GraphDatabaseHandle;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'toopo-graphdb-'));
    const file = path.join(dir, 'graph.db').split(path.sep).join('/');
    handle = createGraphDatabase({ databaseUrl: `file:${file}` });
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

  it('exposes a repository that persists and reads back', async () => {
    const result = await handle.graphRepository.persistGraph(document);
    expect(result.nodes).toBe(1);
    const node = await handle.graphRepository.getNode('sA');
    expect(node?.id).toBe('sA');
  });
});
