import { describe, expect, it } from 'vitest';
import { LocationSchema, PositionSchema } from './location';

describe('PositionSchema', () => {
  it('accepts 0-based non-negative coordinates', () => {
    expect(PositionSchema.safeParse({ row: 0, column: 0 }).success).toBe(true);
  });

  it('rejects negative or non-integer coordinates', () => {
    expect(PositionSchema.safeParse({ row: -1, column: 0 }).success).toBe(false);
    expect(PositionSchema.safeParse({ row: 1.5, column: 0 }).success).toBe(false);
  });
});

describe('LocationSchema', () => {
  it('accepts a full location with byte offsets', () => {
    const result = LocationSchema.safeParse({
      start: { row: 0, column: 0 },
      end: { row: 2, column: 10 },
      startByte: 0,
      endByte: 42,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a location missing byte offsets', () => {
    const result = LocationSchema.safeParse({
      start: { row: 0, column: 0 },
      end: { row: 2, column: 10 },
    });
    expect(result.success).toBe(false);
  });
});
