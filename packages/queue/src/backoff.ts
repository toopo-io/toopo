/**
 * Exponential backoff with full jitter (ADR-0023 §5): the delay before the next
 * delivery is a uniform random draw from `[0, ceiling]`, where the ceiling grows
 * exponentially in the attempt count and is clamped by `capMs`. Full jitter (vs
 * plain exponential or equal jitter) maximally decorrelates concurrent workers'
 * retries — the standard against a thundering herd.
 *
 * Pure and deterministic: the RNG is injected (`random`), so tests pin the draw
 * and assert the delay falls inside the computed bound (ADR cardinal principle —
 * determinism; no hidden `Math.random`).
 */
import type { RetryPolicy } from './retry-policy.js';

/** A source of uniform randomness in `[0, 1)` — `Math.random` in production. */
export type Random = () => number;

/**
 * The exponential ceiling for a given attempt: `baseMs * 2^(attempt-1)`, clamped
 * to `capMs`. `attempt` is 1-based (1 = the first retry, after one failed
 * delivery). Computed with `Math.min` so an overflow to `Infinity` for a large
 * attempt collapses to `capMs` rather than escaping the cap.
 */
export function backoffCeilingMs(attempt: number, policy: RetryPolicy): number {
  if (!Number.isInteger(attempt) || attempt < 1) {
    throw new Error(`backoffCeilingMs: attempt must be an integer >= 1, got ${attempt}`);
  }
  return Math.min(policy.capMs, policy.baseMs * 2 ** (attempt - 1));
}

/**
 * The full-jitter delay in ms for the next delivery: a uniform draw from
 * `[0, ceiling]`. The result is floored to an integer millisecond.
 */
export function computeBackoff(attempt: number, policy: RetryPolicy, random: Random): number {
  const ceiling = backoffCeilingMs(attempt, policy);
  const draw = random();
  if (!Number.isFinite(draw) || draw < 0 || draw >= 1) {
    throw new Error(`computeBackoff: random() must return a value in [0, 1), got ${draw}`);
  }
  return Math.floor(draw * (ceiling + 1));
}
