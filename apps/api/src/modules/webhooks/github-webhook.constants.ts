/**
 * Shared constants for the GitHub push-webhook receiver (ADR-0024).
 */
import { CANONICAL_REPO_HOST } from '@toopo/queue';

/** The route the GitHub App posts to. Versioned under `/v1` like every API route. */
export const GITHUB_WEBHOOK_ROUTE = 'webhooks/github';

/**
 * The canonical repo host for GitHub.com (ADR-0024 §7). B3 resolves and stamps
 * the job reference with this literal; B5 (connect) MUST store the same string,
 * since `findProjectByRepo` is an exact match. This is the binding host
 * normalization across slices — the queue schema pins the same constant, so a
 * reference naming any other host cannot even be enqueued (ADR-0025 §7).
 */
export const GITHUB_WEBHOOK_HOST = CANONICAL_REPO_HOST;

/**
 * The maximum payload the JSON body parser accepts before the signature gate
 * (ADR-0024 §2). GitHub caps deliverable webhook payloads at 25 MB and never
 * sends a larger one; we buffer 25 MiB (26 214 400 B ≥ 25 MB, a small margin) so
 * a legitimate large push is never rejected with a 413 — a silently-missed push
 * is the worse failure. Buffering up to the cap before verification is inherent
 * to HMAC webhook auth; edge rate-limiting is the mitigation (out of B3 scope).
 */
export const GITHUB_WEBHOOK_MAX_PAYLOAD_BYTES = 25 * 1024 * 1024;
