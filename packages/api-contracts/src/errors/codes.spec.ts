import { describe, expect, it } from 'vitest';
import { ErrorCode, ErrorResponseSchema } from './index';

describe('ErrorCode', () => {
  it('exposes the documented code set', () => {
    expect(Object.values(ErrorCode).sort()).toEqual(
      [
        'CONFLICT',
        'FORBIDDEN',
        'INTERNAL',
        'NOT_FOUND',
        'RATE_LIMITED',
        'SERVICE_UNAVAILABLE',
        'UNAUTHORIZED',
        'VALIDATION_FAILED',
      ].sort(),
    );
  });

  it('mirrors each key to itself as a string literal', () => {
    for (const [key, value] of Object.entries(ErrorCode)) {
      expect(value).toBe(key);
    }
  });
});

describe('ErrorResponseSchema', () => {
  it('round-trips a minimal error', () => {
    const payload = { code: ErrorCode.NOT_FOUND, message: 'Resource not found' };
    const parsed = ErrorResponseSchema.parse(payload);
    expect(parsed).toEqual(payload);
  });

  it('round-trips an error with optional fields', () => {
    const payload = {
      code: ErrorCode.VALIDATION_FAILED,
      message: 'Validation failed',
      requestId: 'req-123',
      details: { field: 'email', reason: 'invalid' },
    };
    const parsed = ErrorResponseSchema.parse(payload);
    expect(parsed).toEqual(payload);
  });

  it('rejects an unknown code', () => {
    const result = ErrorResponseSchema.safeParse({ code: 'BOOM', message: 'x' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty message', () => {
    const result = ErrorResponseSchema.safeParse({ code: ErrorCode.INTERNAL, message: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a non-string message', () => {
    const result = ErrorResponseSchema.safeParse({ code: ErrorCode.INTERNAL, message: 42 });
    expect(result.success).toBe(false);
  });

  it('rejects a missing code', () => {
    const result = ErrorResponseSchema.safeParse({ message: 'no code' });
    expect(result.success).toBe(false);
  });

  it('round-trips an interpolation params object', () => {
    const payload = {
      code: ErrorCode.VALIDATION_FAILED,
      message: 'Validation failed',
      params: { minimum: 1, field: 'intervalSeconds', strict: true },
    };
    const parsed = ErrorResponseSchema.parse(payload);
    expect(parsed.params).toEqual({ minimum: 1, field: 'intervalSeconds', strict: true });
  });

  it('rejects params containing an object value', () => {
    const result = ErrorResponseSchema.safeParse({
      code: ErrorCode.VALIDATION_FAILED,
      message: 'x',
      params: { nested: { not: 'allowed' } },
    });
    expect(result.success).toBe(false);
  });

  it('rejects params containing an array value', () => {
    const result = ErrorResponseSchema.safeParse({
      code: ErrorCode.VALIDATION_FAILED,
      message: 'x',
      params: { list: [1, 2, 3] },
    });
    expect(result.success).toBe(false);
  });

  it('accepts an absent params field', () => {
    const payload = { code: ErrorCode.NOT_FOUND, message: 'Resource not found' };
    const parsed = ErrorResponseSchema.parse(payload);
    expect(parsed.params).toBeUndefined();
  });
});
