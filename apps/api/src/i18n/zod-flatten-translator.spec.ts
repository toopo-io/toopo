import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { I18nService } from './i18n.service';
import { translateFlattenedZodError } from './zod-flatten-translator';

const fakeI18n: Pick<I18nService, 'translate'> = {
  translate: (locale, key, params): string => {
    const rendered =
      params !== undefined
        ? Object.entries(params)
            .map(([name, value]) => `${name}=${String(value)}`)
            .join(',')
        : '';
    return `[${locale}:${key}${rendered.length > 0 ? `|${rendered}` : ''}]`;
  },
};

function makeError(issues: z.core.$ZodIssue[]): z.ZodError {
  return new z.ZodError(issues);
}

describe('translateFlattenedZodError', () => {
  it('returns empty buckets when the error has no issues', () => {
    const result = translateFlattenedZodError(makeError([]), 'en', fakeI18n);
    expect(result).toEqual({ formErrors: [], fieldErrors: {} });
  });

  it('translates a single field issue into fieldErrors keyed by the first path segment', () => {
    const result = translateFlattenedZodError(
      makeError([
        {
          code: 'too_small',
          minimum: 1,
          path: ['intervalSeconds'],
          message: '',
        } as z.core.$ZodIssue,
      ]),
      'en',
      fakeI18n,
    );
    expect(result).toEqual({
      formErrors: [],
      fieldErrors: {
        intervalSeconds: ['[en:errors.validation.too_small|path=intervalSeconds,minimum=1]'],
      },
    });
  });

  it('translates form-level issues (empty path) into formErrors', () => {
    const result = translateFlattenedZodError(
      makeError([
        { code: 'invalid_type', expected: 'object', path: [], message: '' } as z.core.$ZodIssue,
      ]),
      'en',
      fakeI18n,
    );
    expect(result.formErrors).toEqual([
      '[en:errors.validation.invalid_type|path=value,expected=object]',
    ]);
    expect(result.fieldErrors).toEqual({});
  });

  it('groups multiple issues on the same field into one bucket', () => {
    const result = translateFlattenedZodError(
      makeError([
        {
          code: 'too_small',
          minimum: 1,
          path: ['intervalSeconds'],
          message: '',
        } as z.core.$ZodIssue,
        {
          code: 'invalid_type',
          expected: 'int',
          path: ['intervalSeconds'],
          message: '',
        } as z.core.$ZodIssue,
      ]),
      'en',
      fakeI18n,
    );
    expect(result.fieldErrors['intervalSeconds']).toEqual([
      '[en:errors.validation.too_small|path=intervalSeconds,minimum=1]',
      '[en:errors.validation.not_integer|path=intervalSeconds]',
    ]);
  });

  it('separates issues across different fields into distinct buckets', () => {
    const result = translateFlattenedZodError(
      makeError([
        { code: 'too_small', minimum: 1, path: ['a'], message: '' } as z.core.$ZodIssue,
        { code: 'too_big', maximum: 10, path: ['b'], message: '' } as z.core.$ZodIssue,
      ]),
      'en',
      fakeI18n,
    );
    expect(Object.keys(result.fieldErrors).sort()).toEqual(['a', 'b']);
    expect(result.fieldErrors['a']).toEqual(['[en:errors.validation.too_small|path=a,minimum=1]']);
    expect(result.fieldErrors['b']).toEqual(['[en:errors.validation.too_big|path=b,maximum=10]']);
  });

  it('falls back to errors.validation.failed for unmapped issue codes (still translated)', () => {
    const result = translateFlattenedZodError(
      makeError([{ code: 'custom', path: ['weird'], message: '' } as unknown as z.core.$ZodIssue]),
      'en',
      fakeI18n,
    );
    expect(result.fieldErrors['weird']).toEqual(['[en:errors.validation.failed|path=weird]']);
  });

  it('coerces non-string path segments (e.g. array index) to string keys', () => {
    const result = translateFlattenedZodError(
      makeError([
        { code: 'too_small', minimum: 1, path: [0, 'value'], message: '' } as z.core.$ZodIssue,
      ]),
      'en',
      fakeI18n,
    );
    expect(Object.keys(result.fieldErrors)).toEqual(['0']);
  });
});
