import type { z } from 'zod';
import type { InterpolationParams } from './i18n.service';

export interface TranslatedIssue {
  readonly key: string;
  readonly params: InterpolationParams;
}

export function translateZodIssue(issue: z.core.$ZodIssue): TranslatedIssue {
  const path = issue.path.length > 0 ? issue.path.join('.') : 'value';
  switch (issue.code) {
    case 'too_small': {
      const minimum = (issue as { minimum?: unknown }).minimum;
      return {
        key: 'errors.validation.too_small',
        params: { path, minimum: typeof minimum === 'number' ? minimum : Number(minimum) },
      };
    }
    case 'too_big': {
      const maximum = (issue as { maximum?: unknown }).maximum;
      return {
        key: 'errors.validation.too_big',
        params: { path, maximum: typeof maximum === 'number' ? maximum : Number(maximum) },
      };
    }
    case 'invalid_type': {
      const expected = (issue as { expected?: unknown }).expected;
      if (expected === 'int') {
        return { key: 'errors.validation.not_integer', params: { path } };
      }
      return {
        key: 'errors.validation.invalid_type',
        params: { path, expected: typeof expected === 'string' ? expected : 'unknown' },
      };
    }
    default:
      return { key: 'errors.validation.failed', params: { path } };
  }
}
