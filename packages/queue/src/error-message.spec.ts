import { describe, expect, it } from 'vitest';
import { errorMessage } from './error-message.js';

describe('errorMessage', () => {
  it('returns the message of an Error', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
  });

  it('returns a string as-is', () => {
    expect(errorMessage('plain failure')).toBe('plain failure');
  });

  it('serializes a non-Error, non-string value', () => {
    expect(errorMessage({ code: 42 })).toBe('{"code":42}');
  });

  it('falls back to String() when serialization fails (e.g. a cycle)', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(errorMessage(cyclic)).toBe('[object Object]');
  });

  it('handles undefined without throwing', () => {
    expect(typeof errorMessage(undefined)).toBe('string');
  });
});
