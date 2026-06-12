import { describe, expect, it } from 'vitest';
import { childSymbolCategory } from './child-symbol-category';

describe('childSymbolCategory', () => {
  it('maps parameters and props to the parameter bucket', () => {
    expect(childSymbolCategory('ts:parameter')).toBe('parameter');
    expect(childSymbolCategory('react:prop')).toBe('parameter');
  });

  it('maps a variable to the local bucket', () => {
    expect(childSymbolCategory('ts:variable')).toBe('local');
  });

  it('maps nested callables to the nested bucket', () => {
    expect(childSymbolCategory('ts:function')).toBe('nested');
    expect(childSymbolCategory('react:hook')).toBe('nested');
    expect(childSymbolCategory('react:component')).toBe('nested');
  });

  it('returns null for an uncategorised or absent subKind', () => {
    expect(childSymbolCategory('ts:type')).toBeNull();
    expect(childSymbolCategory(undefined)).toBeNull();
    expect(childSymbolCategory('unknown:thing')).toBeNull();
  });
});
