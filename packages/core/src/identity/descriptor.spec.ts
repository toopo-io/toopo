import { describe, expect, it } from 'vitest';
import { DescriptorSchema, DescriptorSuffixSchema } from './descriptor';

describe('DescriptorSuffixSchema', () => {
  it('accepts every SCIP suffix', () => {
    for (const suffix of [
      'namespace',
      'type',
      'term',
      'method',
      'type-parameter',
      'parameter',
      'meta',
      'macro',
    ]) {
      expect(DescriptorSuffixSchema.safeParse(suffix).success).toBe(true);
    }
  });

  it('rejects an unknown suffix', () => {
    expect(DescriptorSuffixSchema.safeParse('field').success).toBe(false);
  });
});

describe('DescriptorSchema', () => {
  it('accepts a named descriptor', () => {
    expect(DescriptorSchema.safeParse({ name: 'Button', suffix: 'type' }).success).toBe(true);
  });

  it('accepts a method descriptor with a disambiguator', () => {
    const result = DescriptorSchema.safeParse({
      name: 'render',
      suffix: 'method',
      disambiguator: 'a',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty name', () => {
    expect(DescriptorSchema.safeParse({ name: '', suffix: 'term' }).success).toBe(false);
  });

  it('rejects unknown keys', () => {
    const result = DescriptorSchema.safeParse({ name: 'x', suffix: 'term', extra: 1 });
    expect(result.success).toBe(false);
  });
});
