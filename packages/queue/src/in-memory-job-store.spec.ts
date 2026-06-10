import type { NewJobInput } from '@toopo/db';
import { describe, expect, it } from 'vitest';
import { InMemoryJobStore } from './in-memory-job-store.js';

const T0 = new Date('2026-06-10T00:00:00.000Z');
const at = (ms: number) => new Date(T0.getTime() + ms);

function newJob(overrides: Partial<NewJobInput> = {}): NewJobInput {
  return {
    dedupeKey: null,
    projectId: 'proj-1',
    repoHost: 'github.com',
    repoOwner: 'toopo',
    repoName: 'toopo',
    commitSha: 'a'.repeat(40),
    availableAt: T0,
    ...overrides,
  };
}

describe('InMemoryJobStore — enqueue', () => {
  it('inserts a ready job with zero attempts', async () => {
    const store = new InMemoryJobStore();
    const { id, deduplicated } = await store.enqueue(newJob(), T0);
    expect(deduplicated).toBe(false);
    const claimed = await store.claim({ leaseMs: 1_000, now: T0 });
    expect(claimed?.id).toBe(id);
    expect(claimed?.attempts).toBe(1);
  });

  it('deduplicates onto an active job sharing the dedupeKey', async () => {
    const store = new InMemoryJobStore();
    const first = await store.enqueue(newJob({ dedupeKey: 'proj-1:sha' }), T0);
    const second = await store.enqueue(newJob({ dedupeKey: 'proj-1:sha' }), T0);
    expect(second).toEqual({ id: first.id, deduplicated: true });
  });

  it('does NOT deduplicate distinct dedupeKeys', async () => {
    const store = new InMemoryJobStore();
    const a = await store.enqueue(newJob({ dedupeKey: 'k1' }), T0);
    const b = await store.enqueue(newJob({ dedupeKey: 'k2' }), T0);
    expect(b.deduplicated).toBe(false);
    expect(b.id).not.toBe(a.id);
  });

  it('allows re-enqueue once the prior job is gone (acked)', async () => {
    const store = new InMemoryJobStore();
    const first = await store.enqueue(newJob({ dedupeKey: 'k' }), T0);
    await store.ack(first.id);
    const second = await store.enqueue(newJob({ dedupeKey: 'k' }), T0);
    expect(second.deduplicated).toBe(false);
  });

  it('treats null dedupeKey as never-deduplicating', async () => {
    const store = new InMemoryJobStore();
    const a = await store.enqueue(newJob({ dedupeKey: null }), T0);
    const b = await store.enqueue(newJob({ dedupeKey: null }), T0);
    expect(b.id).not.toBe(a.id);
    expect(b.deduplicated).toBe(false);
  });
});

describe('InMemoryJobStore — claim', () => {
  it('returns null when nothing is claimable', async () => {
    const store = new InMemoryJobStore();
    expect(await store.claim({ leaseMs: 1_000, now: T0 })).toBeNull();
  });

  it('does not claim a job before its availableAt (delay/backoff respected)', async () => {
    const store = new InMemoryJobStore();
    await store.enqueue(newJob({ availableAt: at(5_000) }), T0);
    expect(await store.claim({ leaseMs: 1_000, now: at(4_999) })).toBeNull();
    expect(await store.claim({ leaseMs: 1_000, now: at(5_000) })).not.toBeNull();
  });

  it('increments attempts on every claim (delivery count)', async () => {
    const store = new InMemoryJobStore();
    await store.enqueue(newJob(), T0);
    const first = await store.claim({ leaseMs: 1_000, now: T0 });
    expect(first?.attempts).toBe(1);
    // lease expires -> reclaimable, attempts advances to 2
    const second = await store.claim({ leaseMs: 1_000, now: at(2_000) });
    expect(second?.id).toBe(first?.id);
    expect(second?.attempts).toBe(2);
  });

  it('does not reclaim a job whose lease is still held', async () => {
    const store = new InMemoryJobStore();
    await store.enqueue(newJob(), T0);
    await store.claim({ leaseMs: 10_000, now: T0 });
    expect(await store.claim({ leaseMs: 10_000, now: at(5_000) })).toBeNull();
  });

  it('claims in availableAt order, then insertion order', async () => {
    const store = new InMemoryJobStore();
    const later = await store.enqueue(newJob({ availableAt: at(100) }), T0);
    const earlier = await store.enqueue(newJob({ availableAt: at(50) }), T0);
    const first = await store.claim({ leaseMs: 1_000, now: at(1_000) });
    expect(first?.id).toBe(earlier.id);
    const second = await store.claim({ leaseMs: 1_000, now: at(1_000) });
    expect(second?.id).toBe(later.id);
  });
});

describe('InMemoryJobStore — ack / retry / deadLetter', () => {
  it('ack removes the job entirely', async () => {
    const store = new InMemoryJobStore();
    const { id } = await store.enqueue(newJob(), T0);
    await store.claim({ leaseMs: 1_000, now: T0 });
    await store.ack(id);
    expect(await store.claim({ leaseMs: 1_000, now: at(10_000) })).toBeNull();
  });

  it('retry reschedules to availableAt and records the error, keeping attempts', async () => {
    const store = new InMemoryJobStore();
    await store.enqueue(newJob(), T0);
    const claimed = await store.claim({ leaseMs: 1_000, now: T0 });
    await store.retry(claimed!.id, at(10_000), 'boom', at(100));
    expect(await store.claim({ leaseMs: 1_000, now: at(9_999) })).toBeNull();
    const again = await store.claim({ leaseMs: 1_000, now: at(10_000) });
    expect(again?.id).toBe(claimed?.id);
    expect(again?.lastError).toBe('boom');
    expect(again?.attempts).toBe(2); // 1 at first claim, +1 at this re-claim
  });

  it('deadLetter moves the job to dead and keeps it (never silent)', async () => {
    const store = new InMemoryJobStore();
    const { id } = await store.enqueue(newJob(), T0);
    const claimed = await store.claim({ leaseMs: 1_000, now: T0 });
    await store.deadLetter(claimed!.id, 'exhausted', at(100));
    // not claimable any more...
    expect(await store.claim({ leaseMs: 1_000, now: at(10_000) })).toBeNull();
    // ...but kept and surfaced
    const dead = await store.listDeadLetters();
    expect(dead.items.map((j) => j.id)).toContain(id);
    expect(dead.items[0]?.lastError).toBe('exhausted');
  });

  it('retry/deadLetter throw on an unknown id (never silently no-op)', async () => {
    const store = new InMemoryJobStore();
    await expect(store.retry('nope', T0, 'e', T0)).rejects.toThrow(/no job/);
    await expect(store.deadLetter('nope', 'e', T0)).rejects.toThrow(/no job/);
  });
});

describe('InMemoryJobStore — listDeadLetters pagination', () => {
  it('keyset-paginates dead jobs by id', async () => {
    const store = new InMemoryJobStore();
    for (let i = 0; i < 3; i++) {
      const { id } = await store.enqueue(newJob({ dedupeKey: `k${i}` }), T0);
      await store.claim({ leaseMs: 1_000, now: T0 });
      await store.deadLetter(id, `e${i}`, T0);
    }
    const page1 = await store.listDeadLetters({ limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();
    const page2 = await store.listDeadLetters({ limit: 2, cursor: page1.nextCursor! });
    expect(page2.items).toHaveLength(1);
    expect(page2.nextCursor).toBeNull();
    const allIds = [...page1.items, ...page2.items].map((j) => j.id);
    expect(new Set(allIds).size).toBe(3);
  });

  it('excludes non-dead jobs', async () => {
    const store = new InMemoryJobStore();
    await store.enqueue(newJob(), T0); // ready, not dead
    expect((await store.listDeadLetters()).items).toHaveLength(0);
  });
});
