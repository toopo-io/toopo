import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { LocaleInterceptor } from './locale.interceptor';

interface FakeRequest {
  headers: Record<string, string | undefined>;
  locale?: string;
}
interface FakeReply {
  header: ReturnType<typeof vi.fn>;
}

function makeContext(
  acceptLanguage?: string,
  overrideHeader?: string,
): {
  context: ExecutionContext;
  request: FakeRequest;
  reply: FakeReply;
} {
  const request: FakeRequest = {
    headers: { 'accept-language': acceptLanguage, 'x-toopo-locale': overrideHeader },
  };
  const reply: FakeReply = { header: vi.fn() };
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => reply,
    }),
  } as unknown as ExecutionContext;
  return { context, request, reply };
}

const noopHandler: CallHandler = {
  handle: () => ({ subscribe: () => undefined }) as never,
};

describe('LocaleInterceptor', () => {
  it('attaches the negotiated locale and Content-Language header', () => {
    const { context, request, reply } = makeContext('en-GB,en;q=0.9');
    new LocaleInterceptor().intercept(context, noopHandler);
    expect(request.locale).toBe('en');
    expect(reply.header).toHaveBeenCalledWith('Content-Language', 'en');
  });

  it('falls back to the default locale when the header is missing', () => {
    const { context, request, reply } = makeContext(undefined);
    new LocaleInterceptor().intercept(context, noopHandler);
    expect(request.locale).toBe('en');
    expect(reply.header).toHaveBeenCalledWith('Content-Language', 'en');
  });

  it('falls back to the default locale for unsupported languages', () => {
    const { context, request, reply } = makeContext('de, ja');
    new LocaleInterceptor().intercept(context, noopHandler);
    expect(request.locale).toBe('en');
    expect(reply.header).toHaveBeenCalledWith('Content-Language', 'en');
  });

  it('passes the x-toopo-locale override through to the negotiator', () => {
    const { context, request, reply } = makeContext('de, ja', 'en');
    new LocaleInterceptor().intercept(context, noopHandler);
    expect(request.locale).toBe('en');
    expect(reply.header).toHaveBeenCalledWith('Content-Language', 'en');
  });
});
