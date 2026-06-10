/**
 * The GitHub webhook headers the receiver reads (ADR-0024). Names are lower-cased
 * to match Fastify's normalized `request.headers`. Shared by the gate and the
 * controller so the header contract lives in one place.
 */
export const GITHUB_EVENT_HEADER = 'x-github-event';
export const GITHUB_DELIVERY_HEADER = 'x-github-delivery';
export const GITHUB_SIGNATURE_HEADER = 'x-hub-signature-256';

/** A single-valued header, or `undefined` for an absent or multi-valued one. */
export function headerValue(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
