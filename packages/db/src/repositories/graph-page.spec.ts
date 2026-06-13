/**
 * A1/A2 — keyset pagination primitives. Pure unit tests: cursor round-trips,
 * malformed-cursor rejection (untrusted input), limit clamping, and the
 * over-fetch page assembly that drives every paginated read.
 */
import { describe, expect, it } from 'vitest';
import {
  buildPage,
  type CursorPart,
  clampLimit,
  DEFAULT_PAGE_LIMIT,
  decodeCursor,
  decodeCursorTuple,
  encodeCursor,
  InvalidCursorError,
  MAX_PAGE_LIMIT,
  numberCursorPart,
} from './graph-page.js';

describe('clampLimit', () => {
  it('defaults when the limit is absent', () => {
    expect(clampLimit(undefined)).toBe(DEFAULT_PAGE_LIMIT);
  });

  it('defaults on a non-finite limit', () => {
    expect(clampLimit(Number.NaN)).toBe(DEFAULT_PAGE_LIMIT);
    expect(clampLimit(Number.POSITIVE_INFINITY)).toBe(DEFAULT_PAGE_LIMIT);
  });

  it('floors fractional limits', () => {
    expect(clampLimit(10.9)).toBe(10);
  });

  it('clamps below 1 up to 1', () => {
    expect(clampLimit(0)).toBe(1);
    expect(clampLimit(-5)).toBe(1);
  });

  it('clamps above the ceiling down to MAX_PAGE_LIMIT', () => {
    expect(clampLimit(MAX_PAGE_LIMIT + 1000)).toBe(MAX_PAGE_LIMIT);
  });

  it('passes a valid in-range limit through', () => {
    expect(clampLimit(25)).toBe(25);
  });
});

describe('cursor encode/decode', () => {
  it('round-trips a string tuple', () => {
    const parts: CursorPart[] = ['edge-key-with-/special:chars'];
    expect(decodeCursor(encodeCursor(parts))).toEqual(parts);
  });

  it('round-trips a mixed number/string tuple, preserving types', () => {
    const parts: CursorPart[] = [3, 'src/`subkind.ts`/SubKindSchema.'];
    const decoded = decodeCursor(encodeCursor(parts));
    expect(decoded).toEqual(parts);
    expect(typeof decoded[0]).toBe('number');
    expect(typeof decoded[1]).toBe('string');
  });

  it('produces a URL-safe blob (no +, /, or = padding)', () => {
    const cursor = encodeCursor(['a/b+c=d']);
    expect(cursor).not.toMatch(/[+/=]/);
  });

  it('rejects a non-base64 cursor', () => {
    expect(() => decodeCursor('not a cursor!!')).toThrow(InvalidCursorError);
  });

  it('rejects a cursor that decodes to a non-array', () => {
    expect(() => decodeCursor(encodeCursorRaw('{"a":1}'))).toThrow(InvalidCursorError);
  });

  it('rejects an empty tuple', () => {
    expect(() => decodeCursor(encodeCursorRaw('[]'))).toThrow(InvalidCursorError);
  });

  it('rejects a tuple containing a non-finite number', () => {
    expect(() => decodeCursor(encodeCursorRaw('[null]'))).toThrow(InvalidCursorError);
  });

  it('decodeCursorTuple accepts a matching arity', () => {
    expect(decodeCursorTuple(encodeCursor([3, 'x']), 2)).toEqual([3, 'x']);
  });

  it('decodeCursorTuple rejects an arity mismatch', () => {
    expect(() => decodeCursorTuple(encodeCursor(['only-one']), 2)).toThrow(InvalidCursorError);
  });

  it('numberCursorPart passes the number the server encoded through', () => {
    expect(numberCursorPart(3, 'cursor')).toBe(3);
  });

  it('numberCursorPart REJECTS a string forged into a numeric slot (never a NaN bind)', () => {
    expect(() => numberCursorPart('abc', 'cursor')).toThrow(InvalidCursorError);
  });
});

/** Encode an arbitrary JSON string as a cursor blob — for malformed-input tests. */
function encodeCursorRaw(json: string): string {
  return Buffer.from(json, 'utf8').toString('base64url');
}

describe('buildPage', () => {
  const toCursor = (row: { key: string }): string => encodeCursor([row.key]);

  it('returns all rows and a null cursor when not over-fetched', () => {
    const rows = [{ key: 'a' }, { key: 'b' }];
    expect(buildPage(rows, 5, toCursor)).toEqual({ items: rows, nextCursor: null });
  });

  it('returns exactly `limit` rows and a null cursor at an exact boundary', () => {
    const rows = [{ key: 'a' }, { key: 'b' }];
    expect(buildPage(rows, 2, toCursor)).toEqual({ items: rows, nextCursor: null });
  });

  it('trims the over-fetched row and emits a cursor from the last kept row', () => {
    const rows = [{ key: 'a' }, { key: 'b' }, { key: 'c' }];
    const page = buildPage(rows, 2, toCursor);
    expect(page.items).toEqual([{ key: 'a' }, { key: 'b' }]);
    expect(page.nextCursor).toBe(encodeCursor(['b']));
  });
});
