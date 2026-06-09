import { describe, expect, it } from 'vitest';
import { CallSitePayloadArgumentSchema } from './payload';

describe('CallSitePayloadArgumentSchema', () => {
  it('accepts a resolved positional argument', () => {
    const result = CallSitePayloadArgumentSchema.safeParse({
      ordinal: 0,
      passKind: 'positional',
      value: '42',
      resolution: 'deterministic',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a named argument', () => {
    const result = CallSitePayloadArgumentSchema.safeParse({
      ordinal: 1,
      name: 'onClick',
      passKind: 'named',
      resolution: 'deterministic',
    });
    expect(result.success).toBe(true);
  });

  it('accepts an inferred spread with confidence', () => {
    const result = CallSitePayloadArgumentSchema.safeParse({
      ordinal: 2,
      passKind: 'spread',
      resolution: 'inferred',
      confidence: 'low',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an inferred spread without confidence (trust invariant)', () => {
    const result = CallSitePayloadArgumentSchema.safeParse({
      ordinal: 2,
      passKind: 'spread',
      resolution: 'inferred',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown passKind', () => {
    const result = CallSitePayloadArgumentSchema.safeParse({
      ordinal: 0,
      passKind: 'rest',
      resolution: 'deterministic',
    });
    expect(result.success).toBe(false);
  });
});
