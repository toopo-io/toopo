import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ConfidenceSchema, ProvenanceSchema, withResolution } from './resolution';

const Schema = withResolution({ value: z.string() });

describe('withResolution', () => {
  it('accepts a deterministic fact without confidence', () => {
    expect(Schema.safeParse({ value: 'x', resolution: 'deterministic' }).success).toBe(true);
  });

  it('rejects a deterministic fact carrying confidence (trust invariant)', () => {
    const result = Schema.safeParse({
      value: 'x',
      resolution: 'deterministic',
      confidence: 'high',
    });
    expect(result.success).toBe(false);
  });

  it('accepts an inferred fact with confidence', () => {
    const result = Schema.safeParse({ value: 'x', resolution: 'inferred', confidence: 'low' });
    expect(result.success).toBe(true);
  });

  it('rejects an inferred fact missing confidence (trust invariant)', () => {
    expect(Schema.safeParse({ value: 'x', resolution: 'inferred' }).success).toBe(false);
  });

  it('rejects an unknown resolution', () => {
    expect(Schema.safeParse({ value: 'x', resolution: 'guessed' }).success).toBe(false);
  });
});

describe('ConfidenceSchema', () => {
  it('accepts the three levels and rejects others', () => {
    expect(ConfidenceSchema.safeParse('high').success).toBe(true);
    expect(ConfidenceSchema.safeParse('certain').success).toBe(false);
  });
});

describe('ProvenanceSchema', () => {
  it('accepts a valid provenance', () => {
    expect(ProvenanceSchema.safeParse({ pass: 'parse', rule: 'tags-query' }).success).toBe(true);
  });

  it('rejects an unknown pass and an empty rule', () => {
    expect(ProvenanceSchema.safeParse({ pass: 'magic', rule: 'x' }).success).toBe(false);
    expect(ProvenanceSchema.safeParse({ pass: 'parse', rule: '' }).success).toBe(false);
  });
});
