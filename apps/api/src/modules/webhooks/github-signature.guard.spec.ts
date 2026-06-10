/**
 * The gate as wired (ADR-0024 §1): the guard runs before the controller and is
 * the structural guarantee that nothing downstream runs for a bad signature. It
 * maps the failure modes to status codes — secret unset → 503 (fail closed),
 * missing → 401, invalid/tampered → 403 — and only returns true for a signature
 * over the exact raw bytes. It logs the delivery id and event, never the body or
 * the signature.
 */
import { createHmac } from 'node:crypto';
import type { ExecutionContext } from '@nestjs/common';
import {
  ForbiddenException,
  type RawBodyRequest,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GithubSignatureGuard } from './github-signature.guard';

const SECRET = 'a-test-webhook-secret-0123456789';
const BODY = Buffer.from(JSON.stringify({ ref: 'refs/heads/main', after: 'c'.repeat(40) }));

function sign(body: Buffer, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

interface FakeRequestInit {
  readonly rawBody?: Buffer;
  readonly signature?: string;
  readonly event?: string;
  readonly delivery?: string;
}

function contextFor(init: FakeRequestInit): ExecutionContext {
  const headers: Record<string, string> = {};
  if (init.signature !== undefined) headers['x-hub-signature-256'] = init.signature;
  if (init.event !== undefined) headers['x-github-event'] = init.event;
  if (init.delivery !== undefined) headers['x-github-delivery'] = init.delivery;
  const request = { headers, rawBody: init.rawBody } as unknown as RawBodyRequest<FastifyRequest>;
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

let logger: PinoLogger;
let warn: ReturnType<typeof vi.fn>;

function makeGuard(secret: string | undefined): GithubSignatureGuard {
  return new GithubSignatureGuard(secret, logger);
}

beforeEach(() => {
  warn = vi.fn();
  logger = { setContext: vi.fn(), warn } as unknown as PinoLogger;
});

describe('GithubSignatureGuard', () => {
  it('returns true for a signature over the exact raw body', () => {
    const guard = makeGuard(SECRET);
    const ctx = contextFor({
      rawBody: BODY,
      signature: sign(BODY, SECRET),
      event: 'push',
      delivery: 'd1',
    });
    expect(guard.canActivate(ctx)).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it('throws 503 (fail closed) when the secret is not configured', () => {
    const guard = makeGuard(undefined);
    const ctx = contextFor({ rawBody: BODY, signature: sign(BODY, SECRET), event: 'push' });
    expect(() => guard.canActivate(ctx)).toThrow(ServiceUnavailableException);
  });

  it('throws 401 when the signature header is missing', () => {
    const guard = makeGuard(SECRET);
    const ctx = contextFor({ rawBody: BODY, event: 'push' });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('throws 401 when the raw body is missing', () => {
    const guard = makeGuard(SECRET);
    const ctx = contextFor({ signature: sign(BODY, SECRET), event: 'push' });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('throws 403 for a valid signature over a different body (tampered)', () => {
    const guard = makeGuard(SECRET);
    const tampered = Buffer.from(JSON.stringify({ ref: 'refs/heads/main', after: 'd'.repeat(40) }));
    const ctx = contextFor({ rawBody: tampered, signature: sign(BODY, SECRET), event: 'push' });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('throws 403 for a signature under the wrong secret', () => {
    const guard = makeGuard(SECRET);
    const ctx = contextFor({
      rawBody: BODY,
      signature: sign(BODY, 'wrong-secret-aaaaaaaaaaaaa'),
      event: 'push',
    });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('does not throw on a hostile malformed header (the timingSafeEqual trap)', () => {
    const guard = makeGuard(SECRET);
    const ctx = contextFor({ rawBody: BODY, signature: `sha256=${'€'.repeat(64)}`, event: 'push' });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('logs only the delivery id and event on reject — never the body or signature', () => {
    const guard = makeGuard(SECRET);
    const signature = sign(BODY, 'wrong-secret-aaaaaaaaaaaaa');
    const ctx = contextFor({ rawBody: BODY, signature, event: 'push', delivery: 'd-99' });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    expect(warn).toHaveBeenCalledTimes(1);
    const [meta] = warn.mock.calls[0] as [Record<string, unknown>, string];
    expect(meta).toEqual({ deliveryId: 'd-99', event: 'push' });
    const serialized = JSON.stringify(warn.mock.calls[0]);
    expect(serialized).not.toContain(signature);
    expect(serialized).not.toContain(BODY.toString('utf8'));
  });
});
