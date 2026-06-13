/**
 * Per-IP throttling on the public edges (security pass), over the real HTTP
 * stack. Proves the ordering contract, not just the limit: the throttler runs
 * BEFORE the expensive gates, so once the budget is spent an unauthenticated
 * flood gets a cheap 429 — no signature work, no session lookup. The app boots
 * with no webhook secret (fail-closed 503 inside the budget), which also shows
 * the throttle composes with the ADR-0024 gate rather than replacing it.
 */
import { VersioningType } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import {
  applyWebhookBodyLimit,
  GITHUB_WEBHOOK_RATE_LIMIT_PER_MINUTE,
} from '../src/modules/webhooks/github-webhook.constants';

const WEBHOOK_URL = '/v1/webhooks/github';
const CONNECT_INSTALL_URL = '/v1/github/install';
const CONNECT_BUDGET = 10;

describe('rate limiting (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
      rawBody: true,
    });
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    // Mirror the production bootstrap (main.ts) so the booted app matches it.
    app.getHttpAdapter().getInstance().addHook('onRoute', applyWebhookBodyLimit);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  it('429s the webhook route once the per-IP budget is spent (cheap pre-HMAC rejection)', async () => {
    for (let i = 0; i < GITHUB_WEBHOOK_RATE_LIMIT_PER_MINUTE; i += 1) {
      const response = await app.inject({
        method: 'POST',
        url: WEBHOOK_URL,
        headers: { 'content-type': 'application/json' },
        payload: '{}',
      });
      // Inside the budget the ADR-0024 gate answers (503 fail-closed: no
      // secret is configured in this app) — never a 429.
      expect(response.statusCode).toBe(503);
    }

    const throttled = await app.inject({
      method: 'POST',
      url: WEBHOOK_URL,
      headers: { 'content-type': 'application/json' },
      payload: '{}',
    });
    expect(throttled.statusCode).toBe(429);
  });

  it('429s the connect flow after its tighter budget', async () => {
    for (let i = 0; i < CONNECT_BUDGET; i += 1) {
      const response = await app.inject({ method: 'GET', url: CONNECT_INSTALL_URL });
      // Inside the budget the session gate answers; the exact status is the
      // gate's business — the throttle must only stay out of the way.
      expect(response.statusCode).not.toBe(429);
    }

    const throttled = await app.inject({ method: 'GET', url: CONNECT_INSTALL_URL });
    expect(throttled.statusCode).toBe(429);
  });
});
