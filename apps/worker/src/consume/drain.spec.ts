/**
 * B4.5 — graceful-shutdown drain tracking. Proves drain() resolves immediately when
 * idle, awaits a genuinely in-flight job, and never throws when the handler rejects
 * (the queue settles the failure; drain only waits).
 */
import { describe, expect, it } from 'vitest';
import { withDrainTracking } from './drain.js';

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('withDrainTracking', () => {
  it('resolves immediately when no job is in flight', async () => {
    const { drain } = withDrainTracking<string>(async () => undefined);
    await expect(drain()).resolves.toBeUndefined();
  });

  it('awaits the in-flight job before resolving', async () => {
    const gate = deferred();
    let finished = false;
    const tracked = withDrainTracking<string>(async () => {
      await gate.promise;
      finished = true;
    });

    const run = tracked.handler('job');
    expect(finished).toBe(false);
    gate.resolve();
    await run;
    await tracked.drain();
    expect(finished).toBe(true);
  });

  it('drain never throws even when the handler rejects', async () => {
    const tracked = withDrainTracking<string>(async () => {
      throw new Error('boom');
    });
    const run = tracked.handler('job');
    await expect(run).rejects.toThrow('boom');
    await expect(tracked.drain()).resolves.toBeUndefined();
  });
});
