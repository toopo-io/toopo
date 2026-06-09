import type { z } from 'zod';

export type Translator = (
  key: string,
  params?: Record<string, string | number | boolean>,
) => string;

export function createZodErrorMap(t: Translator): (issue: z.core.$ZodIssue) => string {
  return (issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : 'value';
    switch (issue.code) {
      case 'too_small': {
        const minimum = (issue as { minimum?: unknown }).minimum;
        return t('errors.validation.too_small', {
          path,
          minimum: typeof minimum === 'number' ? minimum : Number(minimum),
        });
      }
      case 'too_big': {
        const maximum = (issue as { maximum?: unknown }).maximum;
        return t('errors.validation.too_big', {
          path,
          maximum: typeof maximum === 'number' ? maximum : Number(maximum),
        });
      }
      case 'invalid_type': {
        const expected = (issue as { expected?: unknown }).expected;
        if (expected === 'int') {
          return t('errors.validation.not_integer', { path });
        }
        return t('errors.validation.invalid_type', {
          path,
          expected: typeof expected === 'string' ? expected : 'unknown',
        });
      }
      default:
        return t('errors.validation.failed', { path });
    }
  };
}
