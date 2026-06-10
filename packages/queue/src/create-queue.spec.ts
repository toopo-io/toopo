/**
 * The trivial producer → consumer proof on BOTH backends (ADR-0023 §3), plus an
 * end-to-end dead-letter proof. Drives the WHOLE stack — `createQueue` (config-
 * selected impl), the reliability driver, and the real `KyselyJobStore` claim
 * seam — against a live SQLite file and a live Postgres testcontainer.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createQueue, type QueueHandle } from './create-queue.js';
import type { JobReference } from './job-reference.js';
import {
  type QueueBackendHarness,
  SKIP_POSTGRES,
  startQueueBackend,
} from './test-support/queue-backends.js';

const T0 = new Date('2026-06-10T00:00:00.000Z');

const REFERENCE: JobReference = {
  projectId: 'proj-1',
  repo: { host: 'github.com', owner: 'toopo', name: 'toopo' },
  commitSha: 'a'.repeat(40),
};

const noop = (): void => undefined;

const backends = [
  { backend: 'sqlite' as const, skip: false },
  { backend: 'postgres' as const, skip: SKIP_POSTGRES },
];

for (const { backend, skip } of backends) {
  describe.skipIf(skip)(`createQueue [${backend}]`, () => {
    let harness: QueueBackendHarness;
    let handle: QueueHandle;

    beforeAll(async () => {
      harness = await startQueueBackend(backend);
      handle = createQueue({ databaseUrl: harness.databaseUrl, clock: () => T0 });
    }, 120_000);

    afterAll(async () => {
      await handle?.close();
      await harness?.cleanup();
    });

    beforeEach(async () => {
      await harness.reset();
    });

    it('selects the backend from the DATABASE_URL scheme', () => {
      expect(handle.backend).toBe(backend);
    });

    it('enqueue -> consume delivers the exact reference, then acks it away', async () => {
      const { deduplicated } = await handle.queue.enqueue(REFERENCE);
      expect(deduplicated).toBe(false);

      const seen: JobReference[] = [];
      const consumer = handle.createConsumer({
        handler: async (job) => {
          seen.push(job.reference);
        },
        onDeadLetter: noop,
        onError: noop,
        clock: () => T0,
      });

      expect(await consumer.runOnce()).toBe(true);
      expect(seen).toEqual([REFERENCE]);
      expect(seen[0]?.commitSha).toBe('a'.repeat(40));
      // acked -> nothing left to claim
      expect(await consumer.runOnce()).toBe(false);
    });

    it('end-to-end dead-letter: an always-failing job lands in dead, sink fired once', async () => {
      await handle.queue.enqueue(REFERENCE);

      const deadLettered: string[] = [];
      let now = T0;
      const consumer = handle.createConsumer({
        handler: async () => {
          throw new Error('always-fails');
        },
        onDeadLetter: (job, error) => {
          deadLettered.push(`${job.id}:${error}`);
        },
        onError: noop,
        policy: { maxAttempts: 3, baseMs: 1_000, capMs: 5_000 },
        clock: () => now,
        random: () => 0.5,
      });

      for (let i = 0; i < 3; i++) {
        expect(await consumer.runOnce()).toBe(true);
        now = new Date(T0.getTime() + (i + 1) * 1_000_000);
      }

      expect(deadLettered).toHaveLength(1);
      expect(deadLettered[0]).toMatch(/always-fails/);
      const dead = await harness.jobStore.listDeadLetters(); // row kept (never silent)
      expect(dead.items).toHaveLength(1);
      expect(dead.items[0]?.lastError).toBe('always-fails');
      expect(await consumer.runOnce()).toBe(false); // nothing claimable
    });
  });
}
