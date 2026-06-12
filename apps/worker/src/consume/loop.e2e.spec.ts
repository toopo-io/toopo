/**
 * B4.6 — the loop-closing e2e (ADR-0025), OFFLINE on a real local git fixture
 * (file transport, no network, no private auth — that is B5), driven deterministically
 * via the real consumer's runOnce on BOTH backends. It proves the push→cartography
 * loop end-to-end:
 *   1. enqueue commit#1 → consume → the project graph reflects it (Serve reads);
 *   2. commit#2 (add + modify + delete) → reflected, the deleted file's subgraph is
 *      gone, and an UNCHANGED file is a cache hit (no re-parse — asserted via the
 *      cache spy: only parsed files are written);
 *   3. redeliver commit#2 → a true no-op (no persist, no parse);
 *   4. a failing clone → retry → dead-letter, the sink fired (never silent).
 */

import { isSymbolNode } from '@toopo/core';
import {
  createGraphDatabase,
  createParseFragmentDatabase,
  type GraphDatabaseHandle,
  MIGRATIONS_DIR,
  migrateToLatest,
  type ParseFragmentDatabaseHandle,
  type ParseFragmentStore,
} from '@toopo/db';
import { hashContent, PARSE_RESULT_VERSION } from '@toopo/parser';
import { type Consumer, createQueue, type QueueHandle } from '@toopo/queue';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type BackendUrl, SKIP_POSTGRES, startBackendUrl } from '../../test/support/backend-url.js';
import {
  createFixtureRepo,
  type FixtureRepo,
  gitAvailable,
} from '../../test/support/git-fixture.js';
import { GitCloner } from '../clone/git-cloner.js';
import { createIngestJobHandler } from './ingest-job-handler.js';

const PROJECT = 'proj-e2e';
const SCOPE = { projectId: PROJECT };
const REPO = { host: 'github.com', owner: 'toopo', name: 'fixture' } as const;
const KEEP = 'export const keep = 0;\n';
const A_V2 = 'export const a = 99;\n';
const C_NEW = 'export const c = 3;\n';

const SKIP_GIT = !gitAvailable();
const encoder = new TextEncoder();

/** The cache key the delta engine derives for a file's content (ADR-0025 §3). */
function keyFor(content: string): string {
  return `${PARSE_RESULT_VERSION}:${hashContent(encoder.encode(content))}`;
}

/** Wraps the real store, recording the keys written by the most recent putMany —
 *  only PARSED files are put, so an absent key proves a file was not re-parsed. */
class SpyCache {
  lastPutKeys: string[] = [];
  constructor(private readonly inner: ParseFragmentStore) {}
  getMany(keys: readonly string[]): Promise<ReadonlyMap<string, string>> {
    return this.inner.getMany(keys);
  }
  async putMany(entries: ReadonlyMap<string, string>): Promise<void> {
    this.lastPutKeys = [...entries.keys()];
    await this.inner.putMany(entries);
  }
}

const backends = [
  { backend: 'sqlite' as const, skip: false },
  { backend: 'postgres' as const, skip: SKIP_POSTGRES },
];

for (const { backend, skip } of backends) {
  describe.skipIf(skip || SKIP_GIT)(`worker loop e2e [${backend}]`, () => {
    let url: BackendUrl;
    let graph: GraphDatabaseHandle;
    let cacheHandle: ParseFragmentDatabaseHandle;
    let queueHandle: QueueHandle;
    let fixture: FixtureRepo;
    let spyCache: SpyCache;
    let consumer: Consumer;
    let c1: string;
    let c2: string;

    beforeAll(async () => {
      url = await startBackendUrl(backend);
      graph = createGraphDatabase({ databaseUrl: url.databaseUrl });
      await migrateToLatest({ db: graph.db, backend: graph.backend, rootDir: MIGRATIONS_DIR });
      cacheHandle = createParseFragmentDatabase({ databaseUrl: url.databaseUrl });
      queueHandle = createQueue({ databaseUrl: url.databaseUrl });
      spyCache = new SpyCache(cacheHandle.parseFragmentStore);

      fixture = await createFixtureRepo([
        {
          message: 'c1',
          files: {
            'src/a.ts': 'export const a = 1;\n',
            'src/b.ts': 'export const b = 2;\n',
            'src/keep.ts': KEEP,
          },
        },
        { message: 'c2', files: { 'src/a.ts': A_V2, 'src/b.ts': null, 'src/c.ts': C_NEW } },
      ]);
      [c1, c2] = fixture.shas as [string, string];

      const cloner = new GitCloner({ remoteUrl: () => fixture.url, timeoutMs: 60_000 });
      const handler = createIngestJobHandler({
        cloner,
        graph: graph.graphRepository,
        cache: spyCache,
      });
      consumer = queueHandle.createConsumer({
        handler,
        onDeadLetter: () => undefined,
        onError: () => undefined,
      });
    }, 120_000);

    afterAll(async () => {
      await queueHandle?.close();
      await graph?.close();
      await cacheHandle?.close();
      await url?.cleanup();
      await fixture?.cleanup();
    });

    async function symbolNames(): Promise<string[]> {
      const page = await graph.graphRepository.search(SCOPE, { kind: 'symbol', limit: 100 });
      return page.items.filter(isSymbolNode).map((node) => node.name);
    }

    it('1) consumes commit#1 into the project graph', async () => {
      await queueHandle.queue.enqueue(
        { projectId: PROJECT, repo: REPO, commitSha: c1 },
        { dedupeKey: `${PROJECT}:${c1}` },
      );
      expect(await consumer.runOnce()).toBe(true);

      const hashes = await graph.graphRepository.getFileContentHashes(SCOPE);
      expect([...hashes.keys()].sort()).toEqual(['src/a.ts', 'src/b.ts', 'src/keep.ts']);
      expect(await symbolNames()).toEqual(expect.arrayContaining(['a', 'b', 'keep']));
    });

    it('2) applies commit#2 delta: deletes a subgraph; an unchanged file is a cache hit', async () => {
      spyCache.lastPutKeys = [];
      await queueHandle.queue.enqueue(
        { projectId: PROJECT, repo: REPO, commitSha: c2 },
        { dedupeKey: `${PROJECT}:${c2}` },
      );
      expect(await consumer.runOnce()).toBe(true);

      const hashes = await graph.graphRepository.getFileContentHashes(SCOPE);
      expect([...hashes.keys()].sort()).toEqual(['src/a.ts', 'src/c.ts', 'src/keep.ts']);

      const names = await symbolNames();
      expect(names).toEqual(expect.arrayContaining(['a', 'c', 'keep']));
      expect(names).not.toContain('b'); // the deleted file's subgraph is gone

      // keep.ts is byte-identical ⇒ a cache hit ⇒ never re-parsed (its key not put);
      // a.ts (modified) and c.ts (new) were parsed ⇒ written.
      expect(spyCache.lastPutKeys).not.toContain(keyFor(KEEP));
      expect(spyCache.lastPutKeys).toContain(keyFor(A_V2));
      expect(spyCache.lastPutKeys).toContain(keyFor(C_NEW));
    });

    it('3) redelivery of commit#2 is a true no-op (no persist, no parse)', async () => {
      spyCache.lastPutKeys = [];
      const replaceSpy = vi.spyOn(graph.graphRepository, 'replaceProjectGraph');

      await queueHandle.queue.enqueue(
        { projectId: PROJECT, repo: REPO, commitSha: c2 },
        { dedupeKey: `${PROJECT}:${c2}` },
      );
      expect(await consumer.runOnce()).toBe(true);

      expect(replaceSpy).not.toHaveBeenCalled();
      expect(spyCache.lastPutKeys).toEqual([]);
      replaceSpy.mockRestore();
    });

    it('4) a failing clone retries then dead-letters (the sink fires, never silent)', async () => {
      const deadLetters: string[] = [];
      const failConsumer = queueHandle.createConsumer({
        handler: createIngestJobHandler({
          cloner: {
            clone: async () => {
              throw new Error('clone exploded');
            },
          },
          graph: graph.graphRepository,
          cache: spyCache,
        }),
        policy: { maxAttempts: 2, baseMs: 0, capMs: 0 },
        onDeadLetter: (_job, error) => deadLetters.push(error),
        onError: () => undefined,
      });

      await queueHandle.queue.enqueue(
        { projectId: PROJECT, repo: REPO, commitSha: 'd'.repeat(40) },
        { dedupeKey: 'fail-job' },
      );

      expect(await failConsumer.runOnce()).toBe(true); // attempt 1 → retry
      expect(deadLetters).toHaveLength(0);
      expect(await failConsumer.runOnce()).toBe(true); // attempt 2 → dead-letter
      expect(deadLetters).toHaveLength(1);
      expect(deadLetters[0]).toContain('clone exploded');
    });
  });
}
