import { describe, expect, it } from 'vitest';
import { resolveLocaleFromPath } from './path.js';

describe('resolveLocaleFromPath', () => {
  it.each([
    ['/en', 'en'],
    ['/en/health', 'en'],
    ['/en/', 'en'],
  ] as const)('returns %s for path %s', (input, expected) => {
    expect(resolveLocaleFromPath(input)).toBe(expected);
  });

  it.each([
    // `/zz` is a synthetic unsupported-locale segment (not a shipped language).
    '/',
    '',
    '/zz',
    '/zz/health/details',
    '/de',
    '/de/foo',
    '/EN',
    '/en-US',
    '/_next/static',
  ] as const)('returns undefined for unsupported path %p', (input) => {
    expect(resolveLocaleFromPath(input)).toBeUndefined();
  });
});
