/**
 * The reliability driver (ADR-0023 §2, §5): the claim → process → ack / retry /
 * dead-letter loop, written ONCE over the {@link JobStore} port and shared by
 * every implementation (in-memory, DB-backed, and a future Redis impl that
 * brings its own reliability bypasses this driver). All policy lives here; the
 * store stays a dumb set of atoms.
 *
 * Determinism (ADR cardinal principle): the clock and RNG are injected, so a test
 * pins the backoff and lease decisions exactly. Reliability invariants enforced
 * here:
 *   - at-least-once: a job is acked (deleted) only after the handler resolves;
 *   - idempotency support: the stable `id` is handed to the handler so a
 *     redelivered commit is the handler's no-op;
 *   - poison-bounded: `attempts` is counted on claim, and a delivery past
 *     `maxAttempts` is dead-lettered WITHOUT re-running the handler;
 *   - never-silent dead-letter: the mandatory `onDeadLetter` sink fires after the
 *     row is moved to `dead` (kept, audited);
 *   - never-silent infra failure: a store error in the polling loop is surfaced
 *     to the mandatory `onError` sink, and the loop survives it.
 */
import type { ClaimOptions, JobStore } from '@toopo/db';
import { computeBackoff, type Random } from './backoff.js';
import { type ClaimedJob, toClaimedJob } from './claimed-job.js';
import { errorMessage } from './error-message.js';
import { DEFAULT_RETRY_POLICY, type RetryPolicy } from './retry-policy.js';

/** Default visibility lease: how long a claim holds a job before it can be reclaimed. */
export const DEFAULT_LEASE_MS = 30_000;

/** Default idle poll interval when the last claim found no work. */
export const DEFAULT_POLL_INTERVAL_MS = 1_000;

/** A handler's outcome sink — may be async (e.g. an alert), and is awaited. */
type Sink<Args extends readonly unknown[]> = (...args: Args) => void | Promise<void>;

export interface ConsumerOptions {
  /** Process one claimed job. Throwing signals failure → retry or dead-letter. */
  readonly handler: (job: ClaimedJob) => Promise<void>;
  /** MANDATORY: invoked when a job is dead-lettered — never silent (ADR-0023 §5). */
  readonly onDeadLetter: Sink<[job: ClaimedJob, error: string]>;
  /** MANDATORY: invoked on an infra error in the polling loop — never silent. */
  readonly onError: Sink<[error: unknown]>;
  /** Retry/backoff policy. Defaults to {@link DEFAULT_RETRY_POLICY}. */
  readonly policy?: RetryPolicy;
  /** Visibility lease in ms. Defaults to {@link DEFAULT_LEASE_MS}. */
  readonly leaseMs?: number;
  /** Idle poll interval in ms. Defaults to {@link DEFAULT_POLL_INTERVAL_MS}. */
  readonly pollIntervalMs?: number;
  /** Injected clock. Defaults to `() => new Date()`. */
  readonly clock?: () => Date;
  /** Injected RNG in `[0, 1)`. Defaults to `Math.random`. */
  readonly random?: Random;
}

/** A running consumer loop; call {@link Subscription.stop} to halt it. */
export interface Subscription {
  stop(): void;
}

export interface Consumer {
  /**
   * Claim and process at most one job. Returns `true` if a job was handled (so a
   * caller can drain), `false` if none was claimable. Handler failures are
   * absorbed into retry/dead-letter; only infra (store) errors propagate.
   */
  runOnce(): Promise<boolean>;
  /** Start polling in the background until {@link Subscription.stop}. */
  start(): Subscription;
}

interface ResolvedOptions {
  readonly handler: (job: ClaimedJob) => Promise<void>;
  readonly onDeadLetter: Sink<[job: ClaimedJob, error: string]>;
  readonly onError: Sink<[error: unknown]>;
  readonly policy: RetryPolicy;
  readonly leaseMs: number;
  readonly pollIntervalMs: number;
  readonly clock: () => Date;
  readonly random: Random;
}

function resolveOptions(options: ConsumerOptions): ResolvedOptions {
  return {
    handler: options.handler,
    onDeadLetter: options.onDeadLetter,
    onError: options.onError,
    policy: options.policy ?? DEFAULT_RETRY_POLICY,
    leaseMs: options.leaseMs ?? DEFAULT_LEASE_MS,
    pollIntervalMs: options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
    clock: options.clock ?? (() => new Date()),
    random: options.random ?? Math.random,
  };
}

/**
 * Build a consumer over `store`. The returned object is stateless beyond the
 * injected dependencies — many consumers may share one store (the DB-backed
 * claim is concurrency-safe; ADR-0023 §2).
 */
export function createConsumer(store: JobStore, options: ConsumerOptions): Consumer {
  const resolved = resolveOptions(options);

  async function deadLetter(id: string, job: ClaimedJob, error: string, now: Date): Promise<void> {
    await store.deadLetter(id, error, now);
    await resolved.onDeadLetter(job, error);
  }

  async function settleFailure(job: ClaimedJob, error: string, now: Date): Promise<void> {
    // `attempts` already counts this delivery (incremented on claim). Retry while
    // attempts remain; otherwise this failure exhausts the budget → dead-letter.
    if (job.attempts < resolved.policy.maxAttempts) {
      const delayMs = computeBackoff(job.attempts, resolved.policy, resolved.random);
      await store.retry(job.id, new Date(now.getTime() + delayMs), error, now);
      return;
    }
    await deadLetter(job.id, job, error, now);
  }

  async function runOnce(): Promise<boolean> {
    const now = resolved.clock();
    const claim: ClaimOptions = { leaseMs: resolved.leaseMs, now };
    const queued = await store.claim(claim);
    if (queued === null) {
      return false;
    }
    const job = toClaimedJob(queued);

    // A delivery past the cap (only reachable after repeated worker crashes that
    // never settled) — dead-letter without re-running the poison handler.
    if (queued.attempts > resolved.policy.maxAttempts) {
      const error = `Exhausted ${resolved.policy.maxAttempts} attempts without resolution (poison)`;
      await deadLetter(job.id, job, error, now);
      return true;
    }

    try {
      await resolved.handler(job);
      await store.ack(job.id);
    } catch (caught) {
      await settleFailure(job, errorMessage(caught), now);
    }
    return true;
  }

  function start(): Subscription {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const loop = async (): Promise<void> => {
      if (stopped) {
        return;
      }
      let didWork = false;
      try {
        didWork = await runOnce();
      } catch (caught) {
        // Infra (store) error — surfaced, never silent; the loop survives it.
        await resolved.onError(caught);
      }
      if (stopped) {
        return;
      }
      timer = setTimeout(
        () => {
          void loop();
        },
        didWork ? 0 : resolved.pollIntervalMs,
      );
    };

    void loop();

    return {
      stop(): void {
        stopped = true;
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
      },
    };
  }

  return { runOnce, start };
}
