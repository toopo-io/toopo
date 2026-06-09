import { describe, expect, it } from 'vitest';
import { EdgeSchema } from './edge';

const base = {
  sourceId: 'a',
  targetId: 'b',
  provenance: { pass: 'resolve', rule: 'direct-import' },
};

describe('EdgeSchema', () => {
  it('accepts each universal edge kind as a deterministic edge', () => {
    for (const kind of [
      'contains',
      'imports',
      'exports',
      'references',
      'calls',
      'extends',
      'implements',
    ]) {
      const result = EdgeSchema.safeParse({ ...base, kind, resolution: 'deterministic' });
      expect(result.success).toBe(true);
    }
  });

  it('rejects an unknown edge kind', () => {
    expect(
      EdgeSchema.safeParse({ ...base, kind: 'renders', resolution: 'deterministic' }).success,
    ).toBe(false);
  });

  it('accepts an inferred edge with confidence and an optional subKind', () => {
    const result = EdgeSchema.safeParse({
      ...base,
      kind: 'references',
      subKind: 'react:propBinding',
      resolution: 'inferred',
      confidence: 'medium',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a deterministic edge carrying confidence (trust invariant)', () => {
    const result = EdgeSchema.safeParse({
      ...base,
      kind: 'calls',
      resolution: 'deterministic',
      confidence: 'high',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an inferred edge without confidence (trust invariant)', () => {
    expect(EdgeSchema.safeParse({ ...base, kind: 'calls', resolution: 'inferred' }).success).toBe(
      false,
    );
  });

  it('requires provenance', () => {
    expect(
      EdgeSchema.safeParse({
        sourceId: 'a',
        targetId: 'b',
        kind: 'calls',
        resolution: 'deterministic',
      }).success,
    ).toBe(false);
  });
});
