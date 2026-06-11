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
import {
  createAuthDatabase,
  createGraphDatabase,
  MIGRATIONS_DIR,
  migrateToLatest,
} from '@toopo/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runCli } from './cli/run.js';
import { ingestAndPersist } from './ingest-and-persist.js';

const fixtureDir = fileURLToPath(new URL('../test/fixtures/sample', import.meta.url));

/** The pre-existing workspace CLI-populated projects are attributed to (ADR-0028). */
const WORKSPACE_ID = 'ws-system';

/** Build worker options for a given repo triple (ADR-0022 §3). */
function opts(databaseUrl: string, repoName: string, workspaceId: string = WORKSPACE_ID) {
  return {
    rootDir: fixtureDir,
    databaseUrl,
    gitignore: false,
    repo: { host: 'github', owner: 'toopo', name: repoName },
    ownerUserId: 'system',
    workspaceId,
  };
}

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
    // Seed the workspace the worker attributes projects to (Better Auth owns this
    // write in production; here we insert it directly so existence validation passes).
    const auth = createAuthDatabase({ databaseUrl });
    await auth.betterAuthDatabase.db
      .insertInto('organization')
      .values({
        id: WORKSPACE_ID,
        name: 'System',
        slug: 'system',
        logo: null,
        metadata: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      })
      .execute();
    await auth.close();
  }, 60_000);

  afterAll(async () => {
    try {
      await rm(dir, { recursive: true, force: true });
    } catch {
      /* best-effort temp cleanup */
    }
  });

  it('ingests the fixture and persists a graph queryable under its project', async () => {
    const result = await ingestAndPersist(opts(databaseUrl, 'sample'));

    expect(result.files).toBeGreaterThan(0);
    expect(result.persisted.nodes).toBeGreaterThan(0);
    expect(result.projectId.length).toBeGreaterThan(0);

    const verify = createGraphDatabase({ databaseUrl });
    try {
      // The graph is only visible under the project it was persisted to.
      const found = await verify.graphRepository.search(
        { projectId: result.projectId },
        {
          query: 'greet',
        },
      );
      expect(found.items.some((node) => node.kind === 'symbol' && node.name === 'greet')).toBe(
        true,
      );
      // A different project sees nothing (composite-key isolation, ADR-0022 §3).
      const other = await verify.graphRepository.search(
        { projectId: 'other-project' },
        {
          query: 'greet',
        },
      );
      expect(other.items).toEqual([]);
    } finally {
      await verify.close();
    }
  }, 60_000);

  it('resolves-or-creates the project: first run creates, a re-run reuses it', async () => {
    const first = await ingestAndPersist(opts(databaseUrl, 'idem'));
    const second = await ingestAndPersist(opts(databaseUrl, 'idem'));
    expect(first.projectCreated).toBe(true);
    expect(second.projectCreated).toBe(false);
    expect(second.projectId).toBe(first.projectId);
    // Idempotent persist into the same project (ADR-0015 §11).
    expect(second.persisted).toEqual(first.persisted);
  }, 60_000);

  it('runCli reports the project and persisted counts', async () => {
    const { text } = await runCli(opts(databaseUrl, 'sample'));
    expect(text).toContain('persisted:');
    expect(text).toContain('project:');
    expect(text).toContain(fixtureDir);
  }, 60_000);

  it('refuses to ingest into a workspace that does not exist (ADR-0028)', async () => {
    await expect(ingestAndPersist(opts(databaseUrl, 'ghost', 'ws-missing'))).rejects.toThrow(
      /does not exist/,
    );
  }, 60_000);
});
