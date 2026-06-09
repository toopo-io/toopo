import { describe, expect, it } from 'vitest';
import { JsonObjectSchema, JsonValueSchema } from './json';

describe('JsonValueSchema', () => {
  it('accepts JSON primitives', () => {
    for (const value of ['text', 42, -3.14, true, false, null]) {
      expect(JsonValueSchema.safeParse(value).success).toBe(true);
    }
  });

  it('accepts nested arrays and objects', () => {
    const value = { a: [1, { b: 'c', d: [true, null] }], e: {} };
    expect(JsonValueSchema.safeParse(value).success).toBe(true);
  });

  it('rejects non-finite numbers (not representable in JSON)', () => {
    expect(JsonValueSchema.safeParse(Number.NaN).success).toBe(false);
    expect(JsonValueSchema.safeParse(Number.POSITIVE_INFINITY).success).toBe(false);
  });

  it('rejects non-JSON values', () => {
    expect(JsonValueSchema.safeParse(undefined).success).toBe(false);
    expect(JsonValueSchema.safeParse(() => 1).success).toBe(false);
    expect(JsonValueSchema.safeParse(Symbol('x')).success).toBe(false);
  });

  it('rejects an object carrying an undefined value', () => {
    expect(JsonValueSchema.safeParse({ a: undefined }).success).toBe(false);
  });
});

describe('JsonObjectSchema', () => {
  it('accepts an empty object and a nested object', () => {
    expect(JsonObjectSchema.safeParse({}).success).toBe(true);
    expect(JsonObjectSchema.safeParse({ a: { b: 1 } }).success).toBe(true);
  });

  it('rejects a non-object root', () => {
    expect(JsonObjectSchema.safeParse('x').success).toBe(false);
    expect(JsonObjectSchema.safeParse(42).success).toBe(false);
    expect(JsonObjectSchema.safeParse(null).success).toBe(false);
  });
});
