/**
 * The retry policy (ADR-0023 §5): how many delivery attempts a job gets and the
 * exponential-backoff envelope between them. `attempts` is counted per DELIVERY
 * (incremented on claim, ADR-0023 §5), so a poison job that crashes
 * the worker before it can reschedule is still bounded by `maxAttempts` and
 * eventually dead-letters.
 */
import { z } from 'zod';

export const RetryPolicySchema = z
  .object({
    /** Maximum delivery attempts before a job is dead-lettered (≥ 1). */
    maxAttempts: z.number().int().positive(),
    /** Base backoff in ms; the ceiling for the first retry (≥ 0). */
    baseMs: z.number().int().nonnegative(),
    /** Hard cap on the backoff ceiling in ms; clamps exponential growth. */
    capMs: z.number().int().nonnegative(),
  })
  .strict()
  .refine((policy) => policy.capMs >= policy.baseMs, {
    message: 'capMs must be >= baseMs',
    path: ['capMs'],
  });

export type RetryPolicy = z.infer<typeof RetryPolicySchema>;

/**
 * The confirmed defaults (ADR-0023 §5): five attempts, a one-second
 * base, a five-minute cap.
 */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 5,
  baseMs: 1_000,
  capMs: 300_000,
};

/** Validates a policy at the configuration boundary (ADR-0006). */
export function parseRetryPolicy(input: unknown): RetryPolicy {
  return RetryPolicySchema.parse(input);
}
