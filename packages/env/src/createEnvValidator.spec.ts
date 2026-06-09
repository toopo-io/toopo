import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createEnvValidator, EnvValidationError } from './createEnvValidator';

describe('createEnvValidator', () => {
  const schema = z.object({ PORT: z.coerce.number().int().min(1) });
  const validate = createEnvValidator(schema);

  it('returns parsed env on valid input', () => {
    const env = validate({ PORT: '4000' });
    expect(env.PORT).toBe(4000);
  });

  it('throws EnvValidationError with issues on invalid input', () => {
    try {
      validate({ PORT: 'not-a-number' });
      expect.fail('expected throw');
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      expect((error as EnvValidationError).issues.length).toBeGreaterThan(0);
    }
  });

  it('includes the failing path in the error message', () => {
    try {
      validate({ PORT: '-5' });
      expect.fail('expected throw');
    } catch (error) {
      expect((error as EnvValidationError).message).toContain('PORT');
    }
  });

  describe('empty-string normalization (Phase 4.1 bug B3)', () => {
    const optionalSchema = z.object({
      REQUIRED: z.string().min(1),
      OPTIONAL: z.string().min(1).optional(),
    });
    const validateOptional = createEnvValidator(optionalSchema);

    it('treats empty-string optional value as undefined', () => {
      const env = validateOptional({ REQUIRED: 'ok', OPTIONAL: '' });
      expect(env.OPTIONAL).toBeUndefined();
    });

    it('still fails when a required value is empty', () => {
      try {
        validateOptional({ REQUIRED: '', OPTIONAL: 'x' });
        expect.fail('expected throw');
      } catch (error) {
        expect(error).toBeInstanceOf(EnvValidationError);
        expect((error as EnvValidationError).message).toContain('REQUIRED');
      }
    });

    it('preserves non-empty optional values', () => {
      const env = validateOptional({ REQUIRED: 'ok', OPTIONAL: 'set' });
      expect(env.OPTIONAL).toBe('set');
    });
  });
});
