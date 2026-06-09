import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, isSupportedLocale, SUPPORTED_LOCALES } from './locales.js';

describe('SUPPORTED_LOCALES', () => {
  it('contains the default locale', () => {
    expect((SUPPORTED_LOCALES as readonly string[]).includes(DEFAULT_LOCALE)).toBe(true);
  });

  it('is exactly the English-only active set (ADR-0018)', () => {
    expect(SUPPORTED_LOCALES).toEqual(['en']);
  });

  it('has no duplicates', () => {
    const set = new Set<string>(SUPPORTED_LOCALES);
    expect(set.size).toBe(SUPPORTED_LOCALES.length);
  });
});

describe('isSupportedLocale', () => {
  it.each(SUPPORTED_LOCALES)('returns true for %s', (locale) => {
    expect(isSupportedLocale(locale)).toBe(true);
  });

  it.each([
    // `zz` is a synthetic unsupported sample; `en-US`/`EN` guard exact-match strictness.
    ['zz', false],
    ['de', false],
    ['', false],
    ['EN', false],
    ['en-US', false],
  ] as const)('returns %p for value %p', (input, expected) => {
    expect(isSupportedLocale(input)).toBe(expected);
  });

  it.each([
    null,
    undefined,
    0,
    1,
    true,
    false,
    {},
    [],
  ])('returns false for non-string value %p', (value) => {
    expect(isSupportedLocale(value)).toBe(false);
  });
});
