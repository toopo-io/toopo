import type { ClaimOptions, JobStore, NewJobInput, QueuedJob } from '@toopo/db';
import { describe, expect, it, vi } from 'vitest';
import { toClaimedJob } from './claimed-job.js';
import { createConsumer } from './consumer.js';
import { InMemoryJobStore } from './in-memory-job-store.js';
import type { RetryPolicy } from './retry-policy.js';

const T0 = new Date('2026-06-10T00:00:00.000Z');
const at = (ms: number) => new Date(T0.getTime() + ms);
const POLICY: RetryPolicy = { maxAttempts: 5, baseMs: 1_000, capMs: 300_000 };

/** A handler that does nothing — for tests where the handler must not be exercised. */
const noop = async (): Promise<void> => undefined;

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

/** Sinks that record their invocations, asserting never-silent behaviour. */
function recordingSinks() {
  const deadLetters: Array<{ id: string; error: string }> = [];
  const errors: unknown[] = [];
  return {
    deadLetters,
    errors,
    onDeadLetter: (job: { id: string }, error: string) => {
      deadLetters.push({ id: job.id, error });
    },
    onError: (error: unknown) => {
      errors.push(error);
    },
  };
}

describe('createConsumer — happy path', () => {
  it('processes then acks (deletes) a job', async () => {
    const store = new InMemoryJobStore();
    await store.enqueue(newJob(), T0);
    const seen: string[] = [];
    const sinks = recordingSinks();
    const consumer = createConsumer(store, {
      handler: async (job) => {
        seen.push(job.reference.commitSha);
      },
      onDeadLetter: sinks.onDeadLetter,
      onError: sinks.onError,
      clock: () => T0,
    });

    expect(await consumer.runOnce()).toBe(true);
    expect(seen).toEqual(['a'.repeat(40)]);
    // acked -> gone
    expect(await store.claim({ leaseMs: 1_000, now: at(10_000) })).toBeNull();
    expect(sinks.deadLetters).toHaveLength(0);
  });

  it('returns false when nothing is claimable', async () => {
    const store = new InMemoryJobStore();
    const sinks = recordingSinks();
    const consumer = createConsumer(store, {
      handler: noop,
      onDeadLetter: sinks.onDeadLetter,
      onError: sinks.onError,
      clock: () => T0,
    });
    expect(await consumer.runOnce()).toBe(false);
  });
});

describe('createConsumer — at-least-once + consume idempotency', () => {
  it('redelivers after lease expiry, and an id-keyed handler applies the effect once', async () => {
    const store = new InMemoryJobStore();
    await store.enqueue(newJob(), T0);

    const processed = new Set<string>();
    let effects = 0;
    const idempotentHandler = (job: QueuedJob): void => {
      const { id } = toClaimedJob(job);
      if (!processed.has(id)) {
        processed.add(id);
        effects += 1;
      }
    };

    // Delivery 1: a consumer claims and runs the effect, then CRASHES before ack
    // (simulated by claiming directly and not settling).
    const d1 = await store.claim({ leaseMs: 1_000, now: T0 });
    idempotentHandler(d1!);

    // The lease expires; the job is redelivered (at-least-once).
    const d2 = await store.claim({ leaseMs: 1_000, now: at(2_000) });
    idempotentHandler(d2!);

    expect(d2?.id).toBe(d1?.id);
    expect(d2?.attempts).toBe(2); // delivery count advanced
    expect(effects).toBe(1); // effect applied exactly once
  });
});

describe('createConsumer — retry with backoff', () => {
  it('reschedules a failed job at now + computeBackoff(attempt), within the jitter bound', async () => {
    const store = new InMemoryJobStore();
    await store.enqueue(newJob(), T0);
    const sinks = recordingSinks();
    const consumer = createConsumer(store, {
      handler: async () => {
        throw new Error('boom');
      },
      onDeadLetter: sinks.onDeadLetter,
      onError: sinks.onError,
      policy: POLICY,
      clock: () => T0,
      random: () => 0.5, // pins full-jitter draw
    });

    expect(await consumer.runOnce()).toBe(true); // attempt 1 fails

    // computeBackoff(1, POLICY, 0.5) = floor(0.5 * (1000 + 1)) = 500ms, within [0, 1000]
    expect(await store.claim({ leaseMs: 1_000, now: at(499) })).toBeNull();
    const reclaimed = await store.claim({ leaseMs: 1_000, now: at(500) });
    expect(reclaimed?.lastError).toBe('boom');
    expect(reclaimed?.attempts).toBe(2);
    expect(sinks.deadLetters).toHaveLength(0); // not dead-lettered yet
  });
});

describe('createConsumer — dead-letter (never silent)', () => {
  it('dead-letters after maxAttempts failures, firing the sink exactly once, keeping the row', async () => {
    const store = new InMemoryJobStore();
    const { id } = await store.enqueue(newJob(), T0);
    const sinks = recordingSinks();
    let handlerCalls = 0;
    let now = T0;
    const consumer = createConsumer(store, {
      handler: async () => {
        handlerCalls += 1;
        throw new Error('always-fails');
      },
      onDeadLetter: sinks.onDeadLetter,
      onError: sinks.onError,
      policy: POLICY,
      clock: () => now,
      random: () => 0.5,
    });

    // Drive deliveries, advancing well past each backoff so the job is reclaimable.
    for (let i = 0; i < POLICY.maxAttempts; i++) {
      expect(await consumer.runOnce()).toBe(true);
      now = at((i + 1) * 1_000_000);
    }

    expect(handlerCalls).toBe(POLICY.maxAttempts); // 5 deliveries, all ran the handler
    expect(sinks.deadLetters).toEqual([{ id, error: 'always-fails' }]); // fired once
    const dead = await store.listDeadLetters();
    expect(dead.items.map((j) => j.id)).toEqual([id]); // row kept and surfaced
    expect(await consumer.runOnce()).toBe(false); // nothing claimable now
  });
});

describe('createConsumer — poison / crash-loop bounded', () => {
  it('dead-letters a delivery past the cap WITHOUT re-running the handler', async () => {
    const store = new InMemoryJobStore();
    const { id } = await store.enqueue(newJob(), T0);

    // Simulate maxAttempts worker crashes: claim repeatedly, never settling, so
    // attempts climbs to the cap with no clean failure path.
    for (let i = 0; i < POLICY.maxAttempts; i++) {
      const claimed = await store.claim({ leaseMs: 1_000, now: at(i * 2_000) });
      expect(claimed?.attempts).toBe(i + 1);
    }

    const sinks = recordingSinks();
    let handlerCalls = 0;
    const consumer = createConsumer(store, {
      handler: async () => {
        handlerCalls += 1;
      },
      onDeadLetter: sinks.onDeadLetter,
      onError: sinks.onError,
      policy: POLICY,
      clock: () => at(1_000_000), // far past the last lease
      random: () => 0.5,
    });

    // The next delivery makes attempts = maxAttempts + 1 -> poison dead-letter.
    expect(await consumer.runOnce()).toBe(true);
    expect(handlerCalls).toBe(0); // poison handler NOT run
    expect(sinks.deadLetters).toHaveLength(1);
    expect(sinks.deadLetters[0]).toMatchObject({ id });
    expect(sinks.deadLetters[0]?.error).toMatch(/poison/i);
  });
});

/** A store whose claim always fails — to exercise the infra-error path. */
class FailingClaimStore implements JobStore {
  async enqueue(): Promise<never> {
    throw new Error('not used');
  }
  async claim(_options: ClaimOptions): Promise<QueuedJob | null> {
    throw new Error('db is down');
  }
  async ack(): Promise<void> {
    // unreachable: claim fails first
  }
  async retry(): Promise<void> {
    // unreachable: claim fails first
  }
  async deadLetter(): Promise<void> {
    // unreachable: claim fails first
  }
  async listDeadLetters(): Promise<never> {
    throw new Error('not used');
  }
}

describe('createConsumer — infra error (never silent)', () => {
  it('propagates a store error out of runOnce', async () => {
    const sinks = recordingSinks();
    const consumer = createConsumer(new FailingClaimStore(), {
      handler: noop,
      onDeadLetter: sinks.onDeadLetter,
      onError: sinks.onError,
      clock: () => T0,
    });
    await expect(consumer.runOnce()).rejects.toThrow(/db is down/);
  });

  it('surfaces a loop infra error to onError and keeps polling', async () => {
    vi.useFakeTimers();
    try {
      const sinks = recordingSinks();
      const consumer = createConsumer(new FailingClaimStore(), {
        handler: noop,
        onDeadLetter: sinks.onDeadLetter,
        onError: sinks.onError,
        clock: () => T0,
        pollIntervalMs: 10,
      });
      const sub = consumer.start();
      await vi.advanceTimersByTimeAsync(0); // first loop tick
      expect(sinks.errors.length).toBeGreaterThanOrEqual(1);
      expect((sinks.errors[0] as Error).message).toMatch(/db is down/);
      sub.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('createConsumer — start()/stop() with defaults', () => {
  it('polls in the background, processes a job, and stops cleanly', async () => {
    const store = new InMemoryJobStore();
    await store.enqueue(newJob(), T0);
    const processed: string[] = [];
    const sinks = recordingSinks();
    let resolveDone: () => void = () => undefined;
    const done = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });
    // No policy/leaseMs/clock/random -> exercises the default resolution.
    const consumer = createConsumer(store, {
      handler: async (job) => {
        processed.push(job.id);
        resolveDone();
      },
      onDeadLetter: sinks.onDeadLetter,
      onError: sinks.onError,
      pollIntervalMs: 5,
    });

    const sub = consumer.start();
    await done;
    sub.stop();
    sub.stop(); // idempotent
    expect(processed).toHaveLength(1);
  });
});
