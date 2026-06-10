/**
 * In-flight tracking for graceful shutdown. The consumer's `Subscription.stop()`
 * halts new claims but does not wait for a job already running; closing the DB
 * connections under it would corrupt that job. This wraps the handler so shutdown
 * can `drain()` — await the currently-running job (if any) — before closing. If the
 * process is killed harder, the job's lease simply expires and another worker
 * reclaims it (at-least-once, ADR-0023); draining just makes a clean stop clean.
 */
export interface DrainTracking<Job> {
  /** The handler to hand to the consumer — identical behaviour, tracked. */
  readonly handler: (job: Job) => Promise<void>;
  /** Resolve once no handler is in flight. Safe to call when idle (resolves at once). */
  drain(): Promise<void>;
}

export function withDrainTracking<Job>(handler: (job: Job) => Promise<void>): DrainTracking<Job> {
  let inFlight: Promise<void> = Promise.resolve();
  return {
    handler: (job: Job): Promise<void> => {
      const run = handler(job);
      // Track a never-rejecting mirror so `drain()` awaits completion without
      // turning a handler failure (which the queue settles) into an unhandled
      // rejection here.
      inFlight = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
    drain: () => inFlight,
  };
}
