import { describe, expect, it } from 'vitest';
import { createInMemoryQueue } from './create-queue.js';
import type { JobReference } from './job-reference.js';

const T0 = new Date('2026-06-10T00:00:00.000Z');

/** A no-op sink for tests that do not assert on dead-letter / error paths. */
const noop = (): void => undefined;
/** A no-op async handler for tests where the handler must not run. */
const asyncNoop = async (): Promise<void> => undefined;

const REFERENCE: JobReference = {
  projectId: 'proj-1',
  repo: { host: 'github.com', owner: 'toopo', name: 'toopo' },
  commitSha: 'a'.repeat(40),
};

describe('Queue.enqueue (in-memory)', () => {
  it('validates the reference and rejects a code-bearing payload', async () => {
    const { queue } = createInMemoryQueue(() => T0);
    const smuggled = { ...REFERENCE, code: 'rm -rf /' } as unknown as JobReference;
    await expect(queue.enqueue(smuggled)).rejects.toThrow();
  });

  it('rejects a malformed commit sha', async () => {
    const { queue } = createInMemoryQueue(() => T0);
    const bad = { ...REFERENCE, commitSha: 'xyz' };
    await expect(queue.enqueue(bad)).rejects.toThrow(/commitSha/);
  });

  it('enqueues and the consumer receives the exact reference', async () => {
    const { queue, createConsumer } = createInMemoryQueue(() => T0);
    await queue.enqueue(REFERENCE);
    const seen: JobReference[] = [];
    const consumer = createConsumer({
      handler: async (job) => {
        seen.push(job.reference);
      },
      onDeadLetter: noop,
      onError: noop,
      clock: () => T0,
    });
    expect(await consumer.runOnce()).toBe(true);
    expect(seen).toEqual([REFERENCE]);
    expect(await consumer.runOnce()).toBe(false); // acked -> gone
  });

  it('deduplicates on dedupeKey while a job is active', async () => {
    const { queue } = createInMemoryQueue(() => T0);
    const first = await queue.enqueue(REFERENCE, { dedupeKey: 'proj-1:sha' });
    const second = await queue.enqueue(REFERENCE, { dedupeKey: 'proj-1:sha' });
    expect(second).toEqual({ id: first.id, deduplicated: true });
  });

  it('honours delayMs (the job is not immediately claimable)', async () => {
    const { queue, createConsumer, store } = createInMemoryQueue(() => T0);
    await queue.enqueue(REFERENCE, { delayMs: 10_000 });
    const consumer = createConsumer({
      handler: asyncNoop,
      onDeadLetter: noop,
      onError: noop,
      clock: () => T0, // before the delay elapses
    });
    expect(await consumer.runOnce()).toBe(false);
    // ...but it is claimable after the delay.
    const claimed = await store.claim({ leaseMs: 1_000, now: new Date(T0.getTime() + 10_000) });
    expect(claimed).not.toBeNull();
  });
});
