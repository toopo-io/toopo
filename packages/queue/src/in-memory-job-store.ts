/**
 * The in-memory {@link JobStore} (ADR-0023 §3): the reference implementation that
 * proves the port is storage-agnostic and backs the deterministic driver tests.
 * It mirrors {@link KyselyJobStore}'s observable contract exactly — same claim
 * order, same `attempts`-on-claim, same lease-expiry reclaim, same active-dedupe,
 * same `ack = delete` / dead-rows-kept — so a test passing here pins the behaviour
 * the DB-backed impl must reproduce on both backends.
 *
 * State is held in a `Map` keyed by job id. Every stored record is immutable: a
 * mutation replaces the map entry with a fresh object (charter immutability), so
 * a `QueuedJob` already handed to a caller is never altered under it.
 */
import { randomUUID } from 'node:crypto';
import {
  buildPage,
  type ClaimOptions,
  clampLimit,
  decodeCursorTuple,
  type EnqueueOutcome,
  encodeCursor,
  type JobStore,
  type NewJobInput,
  type Page,
  type PageOptions,
  type QueuedJob,
} from '@toopo/db';

/** Whether a job is claimable at `now`: ready-and-available, or lease-expired. */
function isClaimable(job: QueuedJob, now: Date): boolean {
  if (job.status === 'ready') {
    return job.availableAt.getTime() <= now.getTime();
  }
  if (job.status === 'processing') {
    return job.leaseUntil !== null && job.leaseUntil.getTime() <= now.getTime();
  }
  return false;
}

/** Whether a job blocks an idempotent enqueue for its dedupe key (still active). */
function isActive(job: QueuedJob): boolean {
  return job.status === 'ready' || job.status === 'processing';
}

export class InMemoryJobStore implements JobStore {
  private readonly jobs = new Map<string, QueuedJob>();

  /** Monotonic insertion sequence — the stable tiebreaker for claim ordering. */
  private sequence = 0;
  private readonly order = new Map<string, number>();

  async enqueue(input: NewJobInput, now: Date): Promise<EnqueueOutcome> {
    if (input.dedupeKey !== null) {
      const active = this.findActiveByDedupeKey(input.dedupeKey);
      if (active !== undefined) {
        return { id: active.id, deduplicated: true };
      }
    }
    const id = randomUUID();
    const job: QueuedJob = {
      id,
      dedupeKey: input.dedupeKey,
      projectId: input.projectId,
      repoHost: input.repoHost,
      repoOwner: input.repoOwner,
      repoName: input.repoName,
      commitSha: input.commitSha,
      status: 'ready',
      attempts: 0,
      availableAt: input.availableAt,
      leaseUntil: null,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(id, job);
    this.order.set(id, this.sequence++);
    return { id, deduplicated: false };
  }

  async claim(options: ClaimOptions): Promise<QueuedJob | null> {
    const next = this.nextClaimable(options.now);
    if (next === undefined) {
      return null;
    }
    const claimed: QueuedJob = {
      ...next,
      status: 'processing',
      attempts: next.attempts + 1,
      leaseUntil: new Date(options.now.getTime() + options.leaseMs),
      updatedAt: options.now,
    };
    this.jobs.set(claimed.id, claimed);
    return claimed;
  }

  async ack(id: string): Promise<void> {
    this.jobs.delete(id);
    this.order.delete(id);
  }

  async retry(id: string, availableAt: Date, error: string, now: Date): Promise<void> {
    const job = this.require(id);
    this.jobs.set(id, {
      ...job,
      status: 'ready',
      availableAt,
      leaseUntil: null,
      lastError: error,
      updatedAt: now,
    });
  }

  async deadLetter(id: string, error: string, now: Date): Promise<void> {
    const job = this.require(id);
    this.jobs.set(id, {
      ...job,
      status: 'dead',
      leaseUntil: null,
      lastError: error,
      updatedAt: now,
    });
  }

  async listDeadLetters(options?: PageOptions): Promise<Page<QueuedJob>> {
    const limit = clampLimit(options?.limit);
    const after =
      options?.cursor !== undefined ? String(decodeCursorTuple(options.cursor, 1)[0]) : '';
    const rows = [...this.jobs.values()]
      .filter((job) => job.status === 'dead' && job.id > after)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .slice(0, limit + 1);
    return buildPage(rows, limit, (job) => encodeCursor([job.id]));
  }

  private findActiveByDedupeKey(dedupeKey: string): QueuedJob | undefined {
    for (const job of this.jobs.values()) {
      if (job.dedupeKey === dedupeKey && isActive(job)) {
        return job;
      }
    }
    return undefined;
  }

  /** The oldest claimable job by (availableAt, insertion order) — the claim scan. */
  private nextClaimable(now: Date): QueuedJob | undefined {
    let best: QueuedJob | undefined;
    for (const job of this.jobs.values()) {
      if (!isClaimable(job, now)) {
        continue;
      }
      if (best === undefined || this.precedes(job, best)) {
        best = job;
      }
    }
    return best;
  }

  private precedes(a: QueuedJob, b: QueuedJob): boolean {
    const at = a.availableAt.getTime();
    const bt = b.availableAt.getTime();
    if (at !== bt) {
      return at < bt;
    }
    return (this.order.get(a.id) ?? 0) < (this.order.get(b.id) ?? 0);
  }

  private require(id: string): QueuedJob {
    const job = this.jobs.get(id);
    if (job === undefined) {
      throw new Error(`InMemoryJobStore: no job with id "${id}"`);
    }
    return job;
  }
}
