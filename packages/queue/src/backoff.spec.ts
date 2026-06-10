import { describe, expect, it } from 'vitest';
import { backoffCeilingMs, computeBackoff } from './backoff.js';
import type { RetryPolicy } from './retry-policy.js';

const POLICY: RetryPolicy = { maxAttempts: 5, baseMs: 1_000, capMs: 300_000 };

describe('backoffCeilingMs', () => {
  it('grows exponentially in the attempt count', () => {
    expect(backoffCeilingMs(1, POLICY)).toBe(1_000); // base * 2^0
    expect(backoffCeilingMs(2, POLICY)).toBe(2_000); // base * 2^1
    expect(backoffCeilingMs(3, POLICY)).toBe(4_000); // base * 2^2
    expect(backoffCeilingMs(4, POLICY)).toBe(8_000); // base * 2^3
  });

  it('clamps growth to capMs', () => {
    expect(backoffCeilingMs(20, POLICY)).toBe(POLICY.capMs);
  });

  it('never escapes the cap even for an overflowing exponent', () => {
    expect(backoffCeilingMs(2_000, POLICY)).toBe(POLICY.capMs);
  });

  it('throws on a non-positive or non-integer attempt', () => {
    expect(() => backoffCeilingMs(0, POLICY)).toThrow(/attempt/);
    expect(() => backoffCeilingMs(-1, POLICY)).toThrow(/attempt/);
    expect(() => backoffCeilingMs(1.5, POLICY)).toThrow(/attempt/);
  });
});

describe('computeBackoff (full jitter)', () => {
  it('returns 0 when the draw is 0 (lower bound of the jitter window)', () => {
    expect(computeBackoff(3, POLICY, () => 0)).toBe(0);
  });

  it('returns within [0, ceiling] for any valid draw', () => {
    const ceiling = backoffCeilingMs(3, POLICY);
    for (const draw of [0, 0.25, 0.5, 0.75, 0.999999]) {
      const delay = computeBackoff(3, POLICY, () => draw);
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(ceiling);
    }
  });

  it('scales the draw across the exponential ceiling', () => {
    // draw 0.5 over ceiling 4000 -> floor(0.5 * 4001) = 2000
    expect(computeBackoff(3, POLICY, () => 0.5)).toBe(2_000);
  });

  it('produces an integer millisecond value', () => {
    const delay = computeBackoff(2, POLICY, () => 0.333333);
    expect(Number.isInteger(delay)).toBe(true);
  });

  it('throws when random() is out of range', () => {
    expect(() => computeBackoff(1, POLICY, () => 1)).toThrow(/random/);
    expect(() => computeBackoff(1, POLICY, () => -0.1)).toThrow(/random/);
    expect(() => computeBackoff(1, POLICY, () => Number.NaN)).toThrow(/random/);
  });
});
