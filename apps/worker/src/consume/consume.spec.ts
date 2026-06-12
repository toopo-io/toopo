/**
 * B4.5 — startConsume wiring + graceful shutdown (ADR-0025 Decision 6), the
 * positive path on SQLite with a fake cloner: enqueue a job → the background
 * consumer claims it → the project graph is populated → shutdown drains and closes
 * cleanly. The comprehensive loop (real git, both backends, delete/idempotent/
 * failure→dead-letter) is the B4.6 e2e.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  createGraphDatabase,
  type GraphDatabaseHandle,
  MIGRATIONS_DIR,
  migrateToLatest,
} from '@toopo/db';
import { createQueue, type QueueHandle } from '@toopo/queue';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RepoCloner } from '../clone/repo-cloner.js';
import { type ConsumeHandle, startConsume } from './consume.js';

const PROJECT = 'proj-consume';
const REPO = { host: 'github.com', owner: 'toopo', name: 'fixture' } as const;
const SHA = 'c'.repeat(40);

async function waitFor(check: () => Promise<boolean>, timeoutMs = 8_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('waitFor: condition not met before timeout');
}

describe('startConsume', () => {
  let dir: string;
  let databaseUrl: string;
  let reader: GraphDatabaseHandle;
  let producer: QueueHandle;
  let consumer: ConsumeHandle | null;

  const tree: Record<string, string> = {
    'src/a.ts': 'export const a = 1;\n',
    'src/b.ts': 'export const b = 2;\n',
  };
  const cloner: RepoCloner = {
    clone: async ({ destination }) => {
      for (const [relative, content] of Object.entries(tree)) {
        const target = join(destination, relative);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, content);
      }
    },
  };

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'worker-consume-'));
    databaseUrl = `file:${join(dir, 'test.db').split('\\').join('/')}`;
    reader = createGraphDatabase({ databaseUrl });
    await migrateToLatest({ db: reader.db, backend: reader.backend, rootDir: MIGRATIONS_DIR });
    producer = createQueue({ databaseUrl });
    consumer = null;
  });

  afterEach(async () => {
    await consumer?.shutdown();
    await producer.close();
    await reader.close();
    // Best-effort: Windows may briefly hold the libSQL file handle after close.
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  });

  it('drains an enqueued job into the project graph, then shuts down cleanly', async () => {
    consumer = startConsume({ databaseUrl, cloner, log: () => undefined });

    await producer.queue.enqueue(
      { projectId: PROJECT, repo: REPO, commitSha: SHA },
      { dedupeKey: `${PROJECT}:${SHA}` },
    );

    await waitFor(async () => {
      const hashes = await reader.graphRepository.getFileContentHashes({ projectId: PROJECT });
      return hashes.size === 2;
    });

    const hashes = await reader.graphRepository.getFileContentHashes({ projectId: PROJECT });
    expect([...hashes.keys()].sort()).toEqual(['src/a.ts', 'src/b.ts']);

    await consumer.shutdown();
    consumer = null; // already shut down — avoid a double shutdown in afterEach
  });
});
