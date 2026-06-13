/**
 * Shared constants for the GitHub push-webhook receiver (ADR-0024).
 */
import { CANONICAL_REPO_HOST } from '@toopo/queue';

/** The route the GitHub App posts to. Versioned under `/v1` like every API route. */
export const GITHUB_WEBHOOK_ROUTE = 'webhooks/github';

/**
 * The canonical repo host for GitHub.com (ADR-0024 §7). The webhook receiver
 * resolves and stamps the job reference with this literal; the install flow
 * (connect) MUST store the same string, since `findProjectByRepo` is an exact
 * match. This is the binding host normalization — the queue schema pins the
 * same constant, so a reference naming any other host cannot even be enqueued
 * (ADR-0025 §7).
 */
export const GITHUB_WEBHOOK_HOST = CANONICAL_REPO_HOST;

/**
 * The maximum payload the webhook ROUTE accepts before the signature gate
 * (ADR-0024 §2) — applied per-route via {@link applyWebhookBodyLimit}, so every
 * other route keeps Fastify's 1 MiB default. GitHub caps deliverable webhook
 * payloads at 25 MB and never sends a larger one; we buffer 25 MiB
 * (26 214 400 B ≥ 25 MB, a small margin) so a legitimate large push is never
 * rejected with a 413 — a silently-missed push is the worse failure. Buffering
 * up to the cap before verification is inherent to HMAC webhook auth; the
 * route throttle below bounds how often an unauthenticated client can pay it.
 */
export const GITHUB_WEBHOOK_MAX_PAYLOAD_BYTES = 25 * 1024 * 1024;

/** The webhook route as Fastify sees it (URI-versioned), for per-route hooks. */
export const GITHUB_WEBHOOK_PATH = `/v1/${GITHUB_WEBHOOK_ROUTE}`;

/**
 * Per-IP webhook deliveries allowed per minute. GitHub does NOT retry a
 * rejected delivery, so the budget is deliberately generous — two pushes per
 * second sustained from one IP — while still bounding the pre-auth 25 MiB
 * buffering an unauthenticated flood can force.
 */
export const GITHUB_WEBHOOK_RATE_LIMIT_PER_MINUTE = 120;

/**
 * Fastify `onRoute` hook scoping the 25 MiB ceiling to the webhook route alone.
 * Mutating the route options object is the documented `onRoute` contract.
 */
export function applyWebhookBodyLimit(route: { url: string; bodyLimit?: number }): void {
  if (route.url === GITHUB_WEBHOOK_PATH) {
    route.bodyLimit = GITHUB_WEBHOOK_MAX_PAYLOAD_BYTES;
  }
}
