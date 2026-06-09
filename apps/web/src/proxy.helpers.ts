// Consumer of routes.ts segments at the proxy layer.
//
// Pure path-matching helpers for the Next proxy. Kept separate from
// `proxy.ts` so unit tests can import them without loading
// `next-intl/middleware` (whose Node ESM resolution conflicts with
// vitest's resolver). See Phase 4.1 bug B5.
//
// The protected-prefix list lives in `lib/routes.ts` so every internal
// URL builder and the proxy's path-matcher agree on which locale-
// stripped segment is gated. To gate a new section, add the segment to
// `ROUTE_SEGMENTS` in @toopo/api-contracts and append the locale-stripped
// path to `protectedPathPrefixes` in `lib/routes.ts`. See ADR-0014
// (internal route URLs — single source of truth) for the full pattern.

import { protectedPathPrefixes } from './lib/routes';

/**
 * Paths that require an authenticated session cookie. Whitelist model
 * (Phase 4.1 bug B5): anything NOT listed here — including unknown URLs —
 * falls through to Next's normal routing, so a stray 404 stays a 404 and
 * does not redirect to /signin. Add new protected sections via
 * `protectedPathPrefixes` in `lib/routes.ts`.
 */
export const PROTECTED_PATH_PREFIXES: readonly string[] = protectedPathPrefixes;

export function isProtectedPath(pathAfterLocale: string): boolean {
  const normalized = pathAfterLocale === '' ? '/' : pathAfterLocale;
  return PROTECTED_PATH_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
  );
}
