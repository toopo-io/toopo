/**
 * KyselyJobStore — the full JobStore contract on BOTH backends (ADR-0017 §6,
 * ADR-0023). Exercises enqueue/dedupe, the claim seam (attempts-on-claim, lease,
 * lease-expiry reclaim, availableAt ordering), ack/retry/deadLetter, and the
 * dead-letter keyset listing — then the load-bearing concurrency proof: parallel
 * claims never hand the same job to two workers (Postgres `FOR UPDATE SKIP
 * LOCKED`; SQLite single-writer serialization).
 *
 * Each test runs against a clean `job` table (a per-test truncate on the shared
 * connection) so the global claim scan can never see another test's rows.
 */
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR } from '../migrations-dir.js';
import { migrateToLatest } from '../migrator.js';
import type { JobDatabase } from '../schema/job-types.js';
import { type BackendHarness, SKIP_POSTGRES, startBackend } from '../test-support/backends.js';
import type { NewJobInput } from './job.repository.js';
import { KyselyJobStore } from './job.repository.kysely.js';

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

const backends = [
  { backend: 'sqlite' as const, skip: false },
  { backend: 'postgres' as const, skip: SKIP_POSTGRES },
];

for (const { backend, skip } of backends) {
  describe.skipIf(skip)(`KyselyJobStore [${backend}]`, () => {
    let harness: BackendHarness;
    let store: KyselyJobStore;

    beforeAll(async () => {
      harness = await startBackend(backend);
      await migrateToLatest({ db: harness.db, backend, rootDir: MIGRATIONS_DIR });
      store = new KyselyJobStore(harness.db as unknown as Kysely<JobDatabase>, backend);
    }, 120_000);

    afterAll(async () => {
      await harness?.cleanup();
    });

    beforeEach(async () => {
      await sql`delete from job`.execute(harness.db);
    });

    it('enqueues then claims, round-tripping the reference with coerced types', async () => {
      const { id, deduplicated } = await store.enqueue(newJob({ commitSha: 'b'.repeat(40) }), T0);
      expect(deduplicated).toBe(false);
      const claimed = await store.claim({ leaseMs: 1_000, now: T0 });
      expect(claimed?.id).toBe(id);
      expect(claimed?.commitSha).toBe('b'.repeat(40));
      expect(claimed?.projectId).toBe('proj-1');
      expect(claimed?.attempts).toBe(1);
      expect(claimed?.status).toBe('processing');
      expect(claimed?.availableAt).toBeInstanceOf(Date);
      expect(claimed?.availableAt.getTime()).toBe(T0.getTime());
      expect(claimed?.leaseUntil?.getTime()).toBe(T0.getTime() + 1_000);
    });

    it('deduplicates onto an active job sharing the dedupeKey', async () => {
      const first = await store.enqueue(newJob({ dedupeKey: 'k' }), T0);
      const second = await store.enqueue(newJob({ dedupeKey: 'k' }), T0);
      expect(second).toEqual({ id: first.id, deduplicated: true });
    });

    it('does not deduplicate distinct keys, and re-enqueues after ack', async () => {
      const a = await store.enqueue(newJob({ dedupeKey: 'k1' }), T0);
      const b = await store.enqueue(newJob({ dedupeKey: 'k2' }), T0);
      expect(b.id).not.toBe(a.id);
      await store.ack(a.id);
      const again = await store.enqueue(newJob({ dedupeKey: 'k1' }), T0);
      expect(again.deduplicated).toBe(false);
    });

    it('respects availableAt (delay / backoff) on claim', async () => {
      await store.enqueue(newJob({ availableAt: at(5_000) }), T0);
      expect(await store.claim({ leaseMs: 1_000, now: at(4_999) })).toBeNull();
      expect(await store.claim({ leaseMs: 1_000, now: at(5_000) })).not.toBeNull();
    });

    it('increments attempts per claim and reclaims after lease expiry', async () => {
      await store.enqueue(newJob(), T0);
      const first = await store.claim({ leaseMs: 1_000, now: T0 });
      expect(first?.attempts).toBe(1);
      expect(await store.claim({ leaseMs: 1_000, now: at(500) })).toBeNull(); // lease held
      const second = await store.claim({ leaseMs: 1_000, now: at(2_000) }); // lease expired
      expect(second?.id).toBe(first?.id);
      expect(second?.attempts).toBe(2);
    });

    it('claims in availableAt order', async () => {
      const later = await store.enqueue(newJob({ availableAt: at(100), dedupeKey: 'l' }), T0);
      const earlier = await store.enqueue(newJob({ availableAt: at(50), dedupeKey: 'e' }), T0);
      expect((await store.claim({ leaseMs: 1_000, now: at(1_000) }))?.id).toBe(earlier.id);
      expect((await store.claim({ leaseMs: 1_000, now: at(1_000) }))?.id).toBe(later.id);
    });

    it('ack removes the job', async () => {
      const { id } = await store.enqueue(newJob(), T0);
      await store.claim({ leaseMs: 1_000, now: T0 });
      await store.ack(id);
      expect(await store.claim({ leaseMs: 1_000, now: at(10_000) })).toBeNull();
    });

    it('retry reschedules and records the error, keeping attempts', async () => {
      await store.enqueue(newJob(), T0);
      const claimed = await store.claim({ leaseMs: 1_000, now: T0 });
      await store.retry(claimed!.id, at(10_000), 'boom', at(100));
      expect(await store.claim({ leaseMs: 1_000, now: at(9_999) })).toBeNull();
      const again = await store.claim({ leaseMs: 1_000, now: at(10_000) });
      expect(again?.lastError).toBe('boom');
      expect(again?.attempts).toBe(2);
    });

    it('deadLetter moves to dead, keeps the row, and surfaces it (never silent)', async () => {
      const { id } = await store.enqueue(newJob(), T0);
      const claimed = await store.claim({ leaseMs: 1_000, now: T0 });
      await store.deadLetter(claimed!.id, 'exhausted', at(100));
      expect(await store.claim({ leaseMs: 1_000, now: at(10_000) })).toBeNull();
      const dead = await store.listDeadLetters();
      expect(dead.items.map((j) => j.id)).toEqual([id]);
      expect(dead.items[0]?.lastError).toBe('exhausted');
      expect(dead.items[0]?.status).toBe('dead');
    });

    it('keyset-paginates dead letters by id', async () => {
      for (let i = 0; i < 3; i++) {
        const { id } = await store.enqueue(newJob({ dedupeKey: `k${i}` }), T0);
        await store.claim({ leaseMs: 1_000, now: T0 });
        await store.deadLetter(id, `e${i}`, T0);
      }
      const page1 = await store.listDeadLetters({ limit: 2 });
      expect(page1.items).toHaveLength(2);
      expect(page1.nextCursor).not.toBeNull();
      const page2 = await store.listDeadLetters({
        limit: 2,
        cursor: page1.nextCursor ?? undefined,
      });
      expect(page2.items).toHaveLength(1);
      expect(page2.nextCursor).toBeNull();
      const ids = [...page1.items, ...page2.items].map((j) => j.id);
      expect(new Set(ids).size).toBe(3);
    });

    it('returns null when nothing is claimable', async () => {
      expect(await store.claim({ leaseMs: 1_000, now: T0 })).toBeNull();
    });

    it('CONCURRENCY: two parallel enqueues of the same dedupeKey collapse to one job', async () => {
      // Both pre-checks may find nothing, both INSERT; the partial unique index
      // rejects the loser, whose error is resolved to the winner (ADR-0023 §5).
      const [a, b] = await Promise.all([
        store.enqueue(newJob({ dedupeKey: 'race' }), T0),
        store.enqueue(newJob({ dedupeKey: 'race' }), T0),
      ]);
      expect(a.id).toBe(b.id);
      expect(a.deduplicated !== b.deduplicated).toBe(true); // exactly one inserted
      const claimed = await store.claim({ leaseMs: 1_000, now: T0 });
      expect(claimed?.id).toBe(a.id);
      expect(await store.claim({ leaseMs: 1_000, now: T0 })).toBeNull(); // only one row
    });

    it('CONCURRENCY: two parallel claims on ONE job never double-claim', async () => {
      await store.enqueue(newJob(), T0);
      const [a, b] = await Promise.all([
        store.claim({ leaseMs: 5_000, now: T0 }),
        store.claim({ leaseMs: 5_000, now: T0 }),
      ]);
      const winners = [a, b].filter((j) => j !== null);
      expect(winners).toHaveLength(1); // exactly one worker got it
    });

    it('CONCURRENCY: parallel claims on many jobs hand out DISTINCT rows', async () => {
      const count = 5;
      for (let i = 0; i < count; i++) {
        await store.enqueue(newJob({ dedupeKey: `job-${i}` }), T0);
      }
      const claims = await Promise.all(
        Array.from({ length: count }, () => store.claim({ leaseMs: 5_000, now: T0 })),
      );
      const ids = claims.filter((j) => j !== null).map((j) => j!.id);
      expect(ids).toHaveLength(count);
      expect(new Set(ids).size).toBe(count); // no id claimed twice
    });
  });
}
