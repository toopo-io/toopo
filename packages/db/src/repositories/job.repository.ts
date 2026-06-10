/**
 * The job-queue storage port (ADR-0023 §2, §6), mirroring {@link GraphRepository}
 * and {@link ProjectRepository}: callers depend on this interface, never on
 * Kysely, so the storage engine stays swappable. Two implementations realize it —
 * the in-memory store in `@toopo/queue` (proof the port is impl-agnostic) and
 * {@link KyselyJobStore} here (dual-backend) — under one shared reliability driver
 * (`@toopo/queue`).
 *
 * Records are flat storage shapes (snake→camel at the boundary, ADR-0017 §10).
 * The queue's nested domain `JobReference` and the mapping to/from these fields
 * live in `@toopo/queue`, keeping the dependency one-way (`queue → db`).
 *
 * Timestamps are exchanged as `Date`; impls persist them as UTC ISO-8601 strings
 * so lexicographic comparison equals chronological order on both backends
 * (ADR-0023 §5), and rehydrate them through the Zod boundary (ADR-0006).
 */
import type { Page, PageOptions } from './graph-page.js';

/**
 * The lifecycle state of a job (ADR-0023 §5). A successful job is DELETED on ack
 * (fork F3 — `ack = delete`), so there is no `done` state; dead jobs are kept for
 * audit.
 *
 *   ready      — enqueued; claimable once `availableAt <= now`.
 *   processing — claimed; reclaimable once `leaseUntil <= now` (crash recovery).
 *   dead       — attempts exhausted; kept, audited, surfaced (never silent).
 */
export type JobStatus = 'ready' | 'processing' | 'dead';

/** The fields a producer supplies to enqueue a job (a reference, never code). */
export interface NewJobInput {
  /** Idempotency key; when set, enqueue is a no-op while a job with it is active. */
  readonly dedupeKey: string | null;
  readonly projectId: string;
  readonly repoHost: string;
  readonly repoOwner: string;
  readonly repoName: string;
  readonly commitSha: string;
  /** When the job first becomes claimable — `now` for immediate, future to delay. */
  readonly availableAt: Date;
}

/** A persisted job as read back from the store (the claim/list result). */
export interface QueuedJob {
  readonly id: string;
  readonly dedupeKey: string | null;
  readonly projectId: string;
  readonly repoHost: string;
  readonly repoOwner: string;
  readonly repoName: string;
  readonly commitSha: string;
  readonly status: JobStatus;
  /** Delivery count — incremented atomically on claim (ADR-0023 §5, fork F1). */
  readonly attempts: number;
  readonly availableAt: Date;
  readonly leaseUntil: Date | null;
  readonly lastError: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** The outcome of an enqueue: the job id, and whether it deduplicated onto an active job. */
export interface EnqueueOutcome {
  readonly id: string;
  /** True when an active job with the same `dedupeKey` already existed. */
  readonly deduplicated: boolean;
}

/** Inputs to a claim: the visibility lease and the injected clock. */
export interface ClaimOptions {
  /** How long the claim holds the job before its lease expires (ms). */
  readonly leaseMs: number;
  /** The injected current time — claim decisions are deterministic. */
  readonly now: Date;
}

/**
 * The storage atoms behind a queue (ADR-0023). The reliability policy (backoff,
 * retry-vs-dead-letter decision, the never-silent dead-letter sink) lives in the
 * `@toopo/queue` driver ON TOP of these atoms — written once, shared by every impl.
 */
export interface JobStore {
  /**
   * Insert a job, or return the existing active job when `dedupeKey` collides
   * with a `ready`/`processing` job (idempotent enqueue). `deduplicated` reports
   * which happened.
   */
  enqueue(input: NewJobInput, now: Date): Promise<EnqueueOutcome>;

  /**
   * Atomically claim the next claimable job — the oldest `ready` job past its
   * `availableAt`, or a `processing` job whose lease has expired — incrementing
   * `attempts` and setting a fresh lease. Returns `null` when none is claimable.
   * The claim is the single dialect-specific seam (ADR-0023 §2): Postgres uses
   * `FOR UPDATE SKIP LOCKED` for concurrent workers; SQLite relies on its
   * single-writer serialization.
   */
  claim(options: ClaimOptions): Promise<QueuedJob | null>;

  /** Remove a successfully-processed job (ADR-0023 §5, `ack = delete`). */
  ack(id: string): Promise<void>;

  /** Reschedule a failed job for another delivery at `availableAt`, recording `error`. */
  retry(id: string, availableAt: Date, error: string, now: Date): Promise<void>;

  /** Move an exhausted job to the `dead` state (kept, audited), recording `error`. */
  deadLetter(id: string, error: string, now: Date): Promise<void>;

  /** List dead-lettered jobs, keyset-paginated by id — the operator/alert path. */
  listDeadLetters(options?: PageOptions): Promise<Page<QueuedJob>>;
}
