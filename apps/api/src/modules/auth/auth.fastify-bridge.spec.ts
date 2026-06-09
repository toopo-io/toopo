import { ErrorCode } from '@toopo/api-contracts';
import type { FastifyRequest } from 'fastify';
import { describe, expect, it } from 'vitest';
import { buildAuthErrorResponse, pickLocaleOverride } from './auth.fastify-bridge';

const fakeI18n = {
  translate: (locale: string, key: string): string => `[${locale}:${key}]`,
};

describe('buildAuthErrorResponse', () => {
  it('maps 500 to ErrorCode.INTERNAL with errors.internal message', () => {
    const result = buildAuthErrorResponse(500, 'req-1', null, fakeI18n);
    expect(result).toEqual({
      code: ErrorCode.INTERNAL,
      message: '[en:errors.internal]',
      requestId: 'req-1',
    });
  });

  it('maps 401 to ErrorCode.UNAUTHORIZED with errors.unauthorized message', () => {
    const result = buildAuthErrorResponse(401, 'req-2', null, fakeI18n);
    expect(result.code).toBe(ErrorCode.UNAUTHORIZED);
    expect(result.message).toBe('[en:errors.unauthorized]');
    expect(result.requestId).toBe('req-2');
  });

  it('maps 404 to ErrorCode.NOT_FOUND', () => {
    const result = buildAuthErrorResponse(404, 'req-3', null, fakeI18n);
    expect(result.code).toBe(ErrorCode.NOT_FOUND);
  });

  it('maps 409 to ErrorCode.CONFLICT', () => {
    const result = buildAuthErrorResponse(409, 'req-4', null, fakeI18n);
    expect(result.code).toBe(ErrorCode.CONFLICT);
  });

  it('treats any 5xx as INTERNAL (e.g. 503 falls through to INTERNAL)', () => {
    const result = buildAuthErrorResponse(599, 'req-5', null, fakeI18n);
    expect(result.code).toBe(ErrorCode.INTERNAL);
  });

  it('falls back to INTERNAL for an unmapped 4xx status', () => {
    const result = buildAuthErrorResponse(418, 'req-6', null, fakeI18n);
    expect(result.code).toBe(ErrorCode.INTERNAL);
  });

  it('honors Accept-Language for locale negotiation', () => {
    const result = buildAuthErrorResponse(500, 'req-7', 'en-GB,en;q=0.9', fakeI18n);
    expect(result.message).toBe('[en:errors.internal]');
  });

  it('produces a body that satisfies the ErrorResponse contract shape', () => {
    const result = buildAuthErrorResponse(401, 'req-8', null, fakeI18n);
    expect(Object.keys(result).sort()).toEqual(['code', 'message', 'requestId']);
    expect(typeof result.code).toBe('string');
    expect(typeof result.message).toBe('string');
    expect(typeof result.requestId).toBe('string');
  });

  it('prefers localeOverride over Accept-Language when both are present', () => {
    const result = buildAuthErrorResponse(401, 'req-9', 'zz-ZZ,zz;q=0.9', fakeI18n, 'en');
    expect(result.message).toBe('[en:errors.unauthorized]');
  });

  it('falls back to Accept-Language when localeOverride is unsupported', () => {
    const result = buildAuthErrorResponse(401, 'req-10', 'en-US,en;q=0.9', fakeI18n, 'de');
    expect(result.message).toBe('[en:errors.unauthorized]');
  });
});

describe('pickLocaleOverride', () => {
  function makeRequest(headerValue: string | string[] | undefined): FastifyRequest {
    return { headers: { 'x-toopo-locale': headerValue } } as unknown as FastifyRequest;
  }

  it('returns the header value verbatim when it is a string', () => {
    // Raw passthrough — `pickLocaleOverride` does not validate against
    // SUPPORTED_LOCALES (the negotiator does). `zz` is a synthetic sample.
    expect(pickLocaleOverride(makeRequest('en'))).toBe('en');
    expect(pickLocaleOverride(makeRequest('zz'))).toBe('zz');
  });

  it('returns null when the header is absent', () => {
    expect(pickLocaleOverride(makeRequest(undefined))).toBeNull();
  });

  it('returns null when the header is not a string (e.g. duplicated)', () => {
    expect(pickLocaleOverride(makeRequest(['en', 'zz']))).toBeNull();
  });
});
