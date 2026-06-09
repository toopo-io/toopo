import { describe, expect, it } from 'vitest';
import { buildQueryString } from './query';

describe('buildQueryString', () => {
  it('returns an empty string when there are no defined params', () => {
    expect(buildQueryString({})).toBe('');
    expect(buildQueryString({ scope: undefined, limit: undefined })).toBe('');
  });

  it('drops undefined values but keeps defined ones', () => {
    expect(buildQueryString({ level: 'package', scope: undefined })).toBe('?level=package');
  });

  it('serializes numbers', () => {
    expect(buildQueryString({ limit: 50 })).toBe('?limit=50');
  });

  it('percent-encodes SCIP ids (slashes, spaces, backticks, hash)', () => {
    const id = 'apps/web/src/file.ts/`MyComp`#';
    const qs = buildQueryString({ id });
    // The raw id must not leak unescaped into the query string.
    expect(qs).not.toContain('/');
    expect(qs).not.toContain('`');
    expect(qs).not.toContain(' ');
    // Round-trips back to the exact id via the URL parser.
    const parsed = new URLSearchParams(qs.slice(1));
    expect(parsed.get('id')).toBe(id);
  });
});
