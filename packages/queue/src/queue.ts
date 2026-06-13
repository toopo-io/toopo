/**
 * The producer-facing port (ADR-0023 §1): `enqueue` a reference-only job. It is
 * the public seam an impl is selected behind — the DB-backed queue here, a future
 * Redis/BullMQ queue later — so producers (the webhook) never depend on the
 * storage engine.
 *
 * `enqueue` validates the reference at the boundary (ADR-0006): a malformed or
 * code-bearing payload is rejected before it ever reaches the store (security
 * baseline). The domain `JobReference` is flattened to the store's `NewJobInput`
 * here, keeping `@toopo/db` ignorant of the domain shape (`queue → db` one-way).
 */
import type { EnqueueOutcome, JobStore } from '@toopo/db';
import { toNewJobInput } from './claimed-job.js';
import { type JobReference, parseJobReference } from './job-reference.js';

export interface EnqueueOptions {
  /** Idempotency key; while a job with it is active, enqueue is a no-op. */
  readonly dedupeKey?: string;
  /** Delay before the job becomes claimable, in ms (default 0 — immediate). */
  readonly delayMs?: number;
}

export interface Queue {
  /**
   * Enqueue a reference-only job. Returns the job id and whether it deduplicated
   * onto an existing active job. Throws (ZodError) on an invalid reference.
   */
  enqueue(reference: JobReference, options?: EnqueueOptions): Promise<EnqueueOutcome>;
}

/** A {@link Queue} backed by any {@link JobStore} (DB-backed or in-memory). */
export class JobStoreQueue implements Queue {
  constructor(
    private readonly store: JobStore,
    private readonly clock: () => Date,
  ) {}

  async enqueue(reference: JobReference, options?: EnqueueOptions): Promise<EnqueueOutcome> {
    const validated = parseJobReference(reference);
    const now = this.clock();
    const delayMs = options?.delayMs ?? 0;
    const availableAt = delayMs > 0 ? new Date(now.getTime() + delayMs) : now;
    const input = toNewJobInput(validated, {
      dedupeKey: options?.dedupeKey ?? null,
      availableAt,
    });
    return this.store.enqueue(input, now);
  }
}
