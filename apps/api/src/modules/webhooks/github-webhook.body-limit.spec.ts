/**
 * The per-route body-limit scoping (security pass): the 25 MiB webhook ceiling
 * must apply to the webhook route ALONE — every other route keeps Fastify's
 * 1 MiB default, so an unauthenticated client cannot buffer 25 MiB against
 * arbitrary endpoints.
 */
import { describe, expect, it } from 'vitest';
import {
  applyWebhookBodyLimit,
  GITHUB_WEBHOOK_MAX_PAYLOAD_BYTES,
  GITHUB_WEBHOOK_PATH,
} from './github-webhook.constants';

describe('applyWebhookBodyLimit', () => {
  it('raises the limit on the webhook route to the GitHub payload ceiling', () => {
    const route = { url: GITHUB_WEBHOOK_PATH };
    applyWebhookBodyLimit(route);
    expect(route).toEqual({
      url: GITHUB_WEBHOOK_PATH,
      bodyLimit: GITHUB_WEBHOOK_MAX_PAYLOAD_BYTES,
    });
  });

  it('leaves every other route untouched (Fastify default stays in force)', () => {
    for (const url of ['/v1/projects', '/v1/auth/sign-in/email', '/v1/github/install/complete']) {
      const route = { url };
      applyWebhookBodyLimit(route);
      expect(route).toEqual({ url });
    }
  });
});
