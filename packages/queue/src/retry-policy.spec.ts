import { describe, expect, it } from 'vitest';
import { DEFAULT_RETRY_POLICY, parseRetryPolicy } from './retry-policy.js';

describe('DEFAULT_RETRY_POLICY', () => {
  it('is the confirmed F3 default (5 / 1000ms / 300000ms)', () => {
    expect(DEFAULT_RETRY_POLICY).toEqual({ maxAttempts: 5, baseMs: 1_000, capMs: 300_000 });
  });

  it('is itself a valid policy', () => {
    expect(parseRetryPolicy(DEFAULT_RETRY_POLICY)).toEqual(DEFAULT_RETRY_POLICY);
  });
});

describe('parseRetryPolicy', () => {
  it('rejects a non-positive maxAttempts', () => {
    expect(() => parseRetryPolicy({ maxAttempts: 0, baseMs: 1_000, capMs: 300_000 })).toThrow();
  });

  it('rejects a negative baseMs', () => {
    expect(() => parseRetryPolicy({ maxAttempts: 5, baseMs: -1, capMs: 300_000 })).toThrow();
  });

  it('rejects capMs below baseMs', () => {
    expect(() => parseRetryPolicy({ maxAttempts: 5, baseMs: 5_000, capMs: 1_000 })).toThrow(
      /capMs/,
    );
  });

  it('rejects an extra field', () => {
    expect(() =>
      parseRetryPolicy({ maxAttempts: 5, baseMs: 1_000, capMs: 300_000, extra: true }),
    ).toThrow();
  });
});
