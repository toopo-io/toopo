/**
 * ADR-0020 Phase D — the worker populate path. Ingests a tiny real TS project
 * (the test fixture) through the actual Parse → Resolve pipeline and persists it
 * into a migrated temp database, then verifies the graph is queryable. Proves
 * the CLI composition end to end without the full repo-scale dogfood (that lives
 * in the apps/api e2e).
 */
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGraphDatabase, MIGRATIONS_DIR, migrateToLatest } from '@toopo/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runCli } from './cli/run.js';
import { ingestAndPersist } from './ingest-and-persist.js';

const fixtureDir = fileURLToPath(new URL('../test/fixtures/sample', import.meta.url));

describe('ingestAndPersist', () => {
  let dir: string;
  let databaseUrl: string;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'toopo-worker-'));
    const file = path.join(dir, 'graph.db').split(path.sep).join('/');
    databaseUrl = `file:${file}`;
    // The DB must be migrated explicitly before the worker persists (ADR-0008).
    const handle = createGraphDatabase({ databaseUrl });
    await migrateToLatest({ db: handle.db, backend: handle.backend, rootDir: MIGRATIONS_DIR });
    await handle.close();
  }, 60_000);

  afterAll(async () => {
    try {
      await rm(dir, { recursive: true, force: true });
    } catch {
      /* best-effort temp cleanup */
    }
  });

  it('ingests the fixture project and persists a queryable graph', async () => {
    const result = await ingestAndPersist({ rootDir: fixtureDir, databaseUrl, gitignore: false });

    expect(result.files).toBeGreaterThan(0);
    expect(result.persisted.nodes).toBeGreaterThan(0);

    const verify = createGraphDatabase({ databaseUrl });
    try {
      const found = await verify.graphRepository.search({ query: 'greet' });
      expect(found.items.some((node) => node.kind === 'symbol' && node.name === 'greet')).toBe(
        true,
      );
    } finally {
      await verify.close();
    }
  }, 60_000);

  it('is idempotent — re-running persists the same counts', async () => {
    const first = await ingestAndPersist({ rootDir: fixtureDir, databaseUrl, gitignore: false });
    const second = await ingestAndPersist({ rootDir: fixtureDir, databaseUrl, gitignore: false });
    expect(second.persisted).toEqual(first.persisted);
  }, 60_000);

  it('runCli reports the persisted counts', async () => {
    const { text } = await runCli({ rootDir: fixtureDir, databaseUrl, gitignore: false });
    expect(text).toContain('persisted:');
    expect(text).toContain(fixtureDir);
  }, 60_000);
});
