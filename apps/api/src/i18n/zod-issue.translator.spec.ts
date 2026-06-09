import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { translateZodIssue } from './zod-issue.translator';

function issue(partial: Partial<z.core.$ZodIssue>): z.core.$ZodIssue {
  return { path: ['intervalSeconds'], message: '', ...partial } as z.core.$ZodIssue;
}

describe('translateZodIssue', () => {
  it('maps too_small to errors.validation.too_small with minimum', () => {
    const result = translateZodIssue(
      issue({ code: 'too_small', minimum: 1 } as Partial<z.core.$ZodIssue>),
    );
    expect(result).toEqual({
      key: 'errors.validation.too_small',
      params: { path: 'intervalSeconds', minimum: 1 },
    });
  });

  it('maps too_big to errors.validation.too_big with maximum', () => {
    const result = translateZodIssue(
      issue({ code: 'too_big', maximum: 3600 } as Partial<z.core.$ZodIssue>),
    );
    expect(result).toEqual({
      key: 'errors.validation.too_big',
      params: { path: 'intervalSeconds', maximum: 3600 },
    });
  });

  it('maps invalid_type with expected="int" to errors.validation.not_integer', () => {
    const result = translateZodIssue(
      issue({ code: 'invalid_type', expected: 'int' } as Partial<z.core.$ZodIssue>),
    );
    expect(result).toEqual({
      key: 'errors.validation.not_integer',
      params: { path: 'intervalSeconds' },
    });
  });

  it('maps invalid_type with expected="number" to errors.validation.invalid_type', () => {
    const result = translateZodIssue(
      issue({ code: 'invalid_type', expected: 'number' } as Partial<z.core.$ZodIssue>),
    );
    expect(result).toEqual({
      key: 'errors.validation.invalid_type',
      params: { path: 'intervalSeconds', expected: 'number' },
    });
  });

  it('falls back to errors.validation.failed for unknown codes', () => {
    const result = translateZodIssue(
      issue({ code: 'custom' } as unknown as Partial<z.core.$ZodIssue>),
    );
    expect(result).toEqual({
      key: 'errors.validation.failed',
      params: { path: 'intervalSeconds' },
    });
  });

  it('uses "value" as the path placeholder for root-level issues', () => {
    const result = translateZodIssue(
      issue({ code: 'invalid_type', expected: 'number', path: [] } as Partial<z.core.$ZodIssue>),
    );
    expect(result.params['path']).toBe('value');
  });
});
