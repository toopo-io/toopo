import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from './locales.js';
import { negotiateLocale, negotiateLocaleFrom } from './negotiate.js';

// `zz` is a SYNTHETIC test-fixture locale — a well-formed but unassigned code,
// never a shipped product language. Pairing it with `en` in a two-locale
// fixture exercises the full negotiation algorithm (q-value ordering,
// regional-subtag matching, override validation, malformed tags) independent
// of how many locales production ships. See ADR-0018.
const FIXTURE = ['en', 'zz'] as const;
const FIXTURE_DEFAULT = 'en';
const negotiate = (
  header: string | null | undefined,
  options?: { override?: string | null },
): 'en' | 'zz' => negotiateLocaleFrom(header, FIXTURE, FIXTURE_DEFAULT, options);

describe('negotiateLocaleFrom (generic negotiation algorithm)', () => {
  it.each([
    null,
    undefined,
    '',
    '   ',
  ] as const)('returns the default locale for empty/missing header %p', (header) => {
    expect(negotiate(header)).toBe(FIXTURE_DEFAULT);
  });

  it('returns the exact match when present', () => {
    expect(negotiate('zz')).toBe('zz');
    expect(negotiate('en')).toBe('en');
  });

  it('matches a regional subtag to its base locale', () => {
    expect(negotiate('zz-ZZ')).toBe('zz');
    expect(negotiate('en-GB')).toBe('en');
  });

  it('respects q-value ordering', () => {
    expect(negotiate('zz;q=0.8, en;q=0.9')).toBe('en');
    expect(negotiate('en;q=0.4, zz;q=0.9')).toBe('zz');
  });

  it('falls through when the highest-q tag is unsupported', () => {
    expect(negotiate('de, zz;q=0.5')).toBe('zz');
  });

  it('skips tags with q=0', () => {
    expect(negotiate('zz;q=0, en')).toBe('en');
  });

  it('ignores the wildcard tag', () => {
    expect(negotiate('*')).toBe(FIXTURE_DEFAULT);
    expect(negotiate('*, zz')).toBe('zz');
  });

  it('returns the default locale when no tag is supported', () => {
    expect(negotiate('de, es, it')).toBe(FIXTURE_DEFAULT);
  });

  it('tolerates malformed entries', () => {
    expect(negotiate(';;;,,,;;')).toBe(FIXTURE_DEFAULT);
    expect(negotiate('not_a_tag, zz')).toBe('zz');
  });

  it('handles whitespace around tags and q-values', () => {
    expect(negotiate('  zz  ;  q=0.9  ,  en ; q=0.7 ')).toBe('zz');
  });

  it('clamps invalid q-values back to 1', () => {
    expect(negotiate('zz;q=2.0, en')).toBe('zz');
  });

  describe('override option', () => {
    it('returns the override when it is a supported locale, ignoring Accept-Language', () => {
      expect(negotiate('zz', { override: 'en' })).toBe('en');
      expect(negotiate('en;q=0.9, zz;q=0.1', { override: 'zz' })).toBe('zz');
    });

    it('falls through to Accept-Language when override is null or undefined', () => {
      expect(negotiate('zz', { override: null })).toBe('zz');
      expect(negotiate('zz', { override: undefined })).toBe('zz');
      expect(negotiate('zz', {})).toBe('zz');
    });

    it('falls through silently when override is an unsupported locale tag', () => {
      expect(negotiate('zz', { override: 'de' })).toBe('zz');
      expect(negotiate('en', { override: 'es' })).toBe('en');
    });

    it('falls through when override is an empty string', () => {
      expect(negotiate('zz', { override: '' })).toBe('zz');
    });

    it('returns the default locale when override is absent and Accept-Language is also absent', () => {
      expect(negotiate(null, { override: null })).toBe(FIXTURE_DEFAULT);
      expect(negotiate(undefined, { override: 'de' })).toBe(FIXTURE_DEFAULT);
    });
  });
});

describe('negotiateLocale (shipped binding — single active locale)', () => {
  it('is bound to the English-only shipped locale set', () => {
    expect(SUPPORTED_LOCALES).toEqual(['en']);
  });

  it.each([
    null,
    undefined,
    '',
    'en',
    'en-GB',
    'de, es',
    '*',
  ] as const)('resolves to the default locale for header %p', (header) => {
    expect(negotiateLocale(header)).toBe(DEFAULT_LOCALE);
  });

  it('honours a supported override and ignores unsupported ones', () => {
    expect(negotiateLocale('en', { override: 'en' })).toBe('en');
    expect(negotiateLocale('en', { override: 'zz' })).toBe(DEFAULT_LOCALE);
  });
});
