/**
 * B4.5 — the ingest job handler (ADR-0025), driven directly (no queue, no git) with
 * a FAKE cloner that writes a controllable tree into the sandbox, a real SQLite
 * graph store, and the real parse-fragment cache. Proves: a job clones → ingests →
 * full-replaces the project graph; a redelivery of the same tree is a no-op (no
 * second replace); and a change (delete + modify) is reflected. Real git + dual
 * backends + failure/dead-letter are the B4.6 e2e.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  createGraphDatabase,
  createParseFragmentDatabase,
  type GraphDatabaseHandle,
  MIGRATIONS_DIR,
  migrateToLatest,
  type ParseFragmentDatabaseHandle,
} from '@toopo/db';
import type { ClaimedJob } from '@toopo/queue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RepoCloner } from '../clone/repo-cloner.js';
import { createIngestJobHandler } from './ingest-job-handler.js';

const PROJECT = 'proj-1';
const SCOPE = { projectId: PROJECT };
const REPO = { host: 'github.com', owner: 'toopo', name: 'fixture' };
const SHA = 'a'.repeat(40);

function job(commitSha: string): ClaimedJob {
  return {
    id: `job-${commitSha.slice(0, 7)}`,
    reference: { projectId: PROJECT, repo: REPO, commitSha },
    attempts: 1,
    dedupeKey: null,
  };
}

describe('createIngestJobHandler', () => {
  let dir: string;
  let graphHandle: GraphDatabaseHandle;
  let cacheHandle: ParseFragmentDatabaseHandle;
  let tree: Record<string, string>;

  // A fake cloner that materialises the current `tree` into the sandbox dir.
  const cloner: RepoCloner = {
    clone: async ({ destination }) => {
      for (const [relative, content] of Object.entries(tree)) {
        const target = join(destination, relative);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, content);
      }
    },
  };

  function handler() {
    return createIngestJobHandler({
      cloner,
      graph: graphHandle.graphRepository,
      cache: cacheHandle.parseFragmentStore,
    });
  }

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'worker-handler-'));
    const databaseUrl = `file:${join(dir, 'test.db').split('\\').join('/')}`;
    graphHandle = createGraphDatabase({ databaseUrl });
    await migrateToLatest({
      db: graphHandle.db,
      backend: graphHandle.backend,
      rootDir: MIGRATIONS_DIR,
    });
    cacheHandle = createParseFragmentDatabase({ databaseUrl });
    tree = { 'src/a.ts': 'export const a = 1;\n', 'src/b.ts': 'export const b = 2;\n' };
  });

  afterEach(async () => {
    await graphHandle.close();
    await cacheHandle.close();
    // Best-effort: Windows may briefly hold the libSQL file handle after close.
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  });

  it('closes the loop: clone → ingest delta → replace project graph', async () => {
    const replace = vi.spyOn(graphHandle.graphRepository, 'replaceProjectGraph');
    await handler()(job(SHA));

    expect(replace).toHaveBeenCalledTimes(1);
    const hashes = await graphHandle.graphRepository.getFileContentHashes(SCOPE);
    expect([...hashes.keys()].sort()).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('is a no-op on redelivery of the same tree (no second replace)', async () => {
    const replace = vi.spyOn(graphHandle.graphRepository, 'replaceProjectGraph');
    await handler()(job(SHA));
    await handler()(job(SHA)); // same content ⇒ stored hashes match ⇒ short-circuit
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it('reflects a change: a deleted file leaves the graph', async () => {
    await handler()(job(SHA));

    // Next commit deletes b.ts and modifies a.ts.
    tree = { 'src/a.ts': 'export const a = 42;\n' };
    await handler()(job('b'.repeat(40)));

    const hashes = await graphHandle.graphRepository.getFileContentHashes(SCOPE);
    expect([...hashes.keys()]).toEqual(['src/a.ts']);
  });
});
