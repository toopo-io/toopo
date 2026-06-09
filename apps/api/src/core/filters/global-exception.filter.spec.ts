import { type ArgumentsHost, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { ErrorCode } from '@toopo/api-contracts';
import { ZodValidationException } from 'nestjs-zod';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { I18nService } from '../../i18n/i18n.service';
import { GlobalExceptionFilter } from './global-exception.filter';

interface FakeRequest {
  id?: string;
  headers: Record<string, string | undefined>;
  locale?: string;
}

interface FakeReply {
  status: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
}

function makeReply(): FakeReply {
  const reply: Partial<FakeReply> = {};
  reply.status = vi.fn().mockReturnValue(reply);
  reply.send = vi.fn().mockReturnValue(reply);
  return reply as FakeReply;
}

function makeHost(request: FakeRequest, reply: FakeReply): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => reply,
    }),
  } as unknown as ArgumentsHost;
}

const fakeLogger = {
  warn: vi.fn(),
  error: vi.fn(),
};
// The translator is stubbed so each case asserts which locale the filter
// resolved (echoed as `[locale:key]`), independent of the real catalogs.
const fakeI18n: Pick<I18nService, 'translate'> = {
  translate: (locale: string, key: string): string => `[${locale}:${key}]`,
};

describe('GlobalExceptionFilter (B8 — locale fallback for guard-thrown exceptions)', () => {
  it('re-negotiates from Accept-Language when request.locale is undefined (guard threw before LocaleInterceptor)', () => {
    const filter = new GlobalExceptionFilter(fakeLogger as never, fakeI18n as I18nService);
    const request: FakeRequest = {
      id: 'req-guard',
      headers: { 'accept-language': 'en-GB,en;q=0.9' },
    };
    const reply = makeReply();

    filter.catch(new UnauthorizedException('Session required'), makeHost(request, reply));

    expect(reply.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    expect(reply.send).toHaveBeenCalledWith({
      code: ErrorCode.UNAUTHORIZED,
      message: '[en:errors.unauthorized]',
      requestId: 'req-guard',
    });
  });

  it('prefers request.locale (set by LocaleInterceptor) over re-negotiation', () => {
    const filter = new GlobalExceptionFilter(fakeLogger as never, fakeI18n as I18nService);
    const request: FakeRequest = {
      id: 'req-handler',
      headers: { 'accept-language': 'de, ja' },
      locale: 'en',
    };
    const reply = makeReply();

    filter.catch(new UnauthorizedException('Session required'), makeHost(request, reply));

    expect(reply.send).toHaveBeenCalledWith({
      code: ErrorCode.UNAUTHORIZED,
      message: '[en:errors.unauthorized]',
      requestId: 'req-handler',
    });
  });

  it('passes the x-toopo-locale override through when a guard throws before the interceptor', () => {
    const filter = new GlobalExceptionFilter(fakeLogger as never, fakeI18n as I18nService);
    const request: FakeRequest = {
      id: 'req-guard-override',
      headers: { 'accept-language': 'de, ja', 'x-toopo-locale': 'en' },
    };
    const reply = makeReply();

    filter.catch(new UnauthorizedException('Session required'), makeHost(request, reply));

    expect(reply.send).toHaveBeenCalledWith({
      code: ErrorCode.UNAUTHORIZED,
      message: '[en:errors.unauthorized]',
      requestId: 'req-guard-override',
    });
  });

  it('falls back to the default locale when neither request.locale nor Accept-Language is set', () => {
    const filter = new GlobalExceptionFilter(fakeLogger as never, fakeI18n as I18nService);
    const request: FakeRequest = { id: 'req-guard-none', headers: {} };
    const reply = makeReply();

    filter.catch(new UnauthorizedException('Session required'), makeHost(request, reply));

    expect(reply.send).toHaveBeenCalledWith({
      code: ErrorCode.UNAUTHORIZED,
      message: '[en:errors.unauthorized]',
      requestId: 'req-guard-none',
    });
  });
});

describe('GlobalExceptionFilter (O1 — nested Zod fieldErrors translation)', () => {
  it('translates nested details.fieldErrors strings using the negotiated locale', () => {
    const filter = new GlobalExceptionFilter(fakeLogger as never, fakeI18n as I18nService);
    const zodError = new z.ZodError([
      {
        code: 'too_big',
        maximum: 3600,
        path: ['intervalSeconds'],
        message: '',
      } as z.core.$ZodIssue,
    ]);
    const exception = new ZodValidationException(zodError);
    const request: FakeRequest = {
      id: 'req-zod-en',
      headers: { 'accept-language': 'en' },
      locale: 'en',
    };
    const reply = makeReply();

    filter.catch(exception, makeHost(request, reply));

    expect(reply.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    const body = reply.send.mock.calls[0]?.[0] as {
      code: string;
      message: string;
      details: { formErrors: string[]; fieldErrors: Record<string, string[]> };
    };
    expect(body.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(body.message).toBe('[en:errors.validation.too_big]');
    expect(body.details.formErrors).toEqual([]);
    expect(body.details.fieldErrors).toEqual({
      intervalSeconds: ['[en:errors.validation.too_big]'],
    });
  });
});
