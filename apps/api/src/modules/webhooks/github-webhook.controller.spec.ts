/**
 * The controller is a thin skin (ADR-0020): it reads the event/delivery headers
 * and parsed body and delegates to the service, then projects the internal
 * result onto the public envelope. The signature gate that precedes it is proven
 * in the guard spec and end-to-end in the e2e; here we pin the delegation and the
 * result→response mapping.
 */
import type { RawBodyRequest } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GithubWebhookController } from './github-webhook.controller';
import type { GithubWebhookService, WebhookResult } from './github-webhook.service';

function requestWith(body: unknown): RawBodyRequest<FastifyRequest> {
  return {
    headers: { 'x-github-event': 'push', 'x-github-delivery': 'delivery-1' },
    body,
  } as unknown as RawBodyRequest<FastifyRequest>;
}

let handle: ReturnType<typeof vi.fn>;
let controller: GithubWebhookController;

beforeEach(() => {
  handle = vi.fn(async (): Promise<WebhookResult> => ({ status: 'enqueued', deduplicated: false }));
  controller = new GithubWebhookController({ handle } as unknown as GithubWebhookService);
});

describe('GithubWebhookController', () => {
  it('delegates the event, delivery id, and parsed body to the service', async () => {
    const body = { ref: 'refs/heads/main' };
    await controller.receive(requestWith(body));
    expect(handle).toHaveBeenCalledWith('push', 'delivery-1', body);
  });

  it('maps an enqueued result to the envelope, carrying deduplicated', async () => {
    handle.mockResolvedValueOnce({ status: 'enqueued', deduplicated: true });
    await expect(controller.receive(requestWith({}))).resolves.toEqual({
      status: 'enqueued',
      deduplicated: true,
    });
  });

  it('maps an ignored result to status only', async () => {
    handle.mockResolvedValueOnce({
      status: 'ignored',
      reason: 'not a commit to the default branch',
    });
    await expect(controller.receive(requestWith({}))).resolves.toEqual({ status: 'ignored' });
  });

  it('maps an acknowledged result to status only', async () => {
    handle.mockResolvedValueOnce({ status: 'acknowledged', reason: "event 'ping' is not a push" });
    await expect(controller.receive(requestWith({}))).resolves.toEqual({ status: 'acknowledged' });
  });
});
