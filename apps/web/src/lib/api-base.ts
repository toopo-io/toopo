/**
 * Resolves the base origin for a fetch to the API, accounting for the
 * browser/server split (ADR-0030 §3).
 *
 * The browser reaches the API at its public origin (`NEXT_PUBLIC_API_URL` /
 * `NEXT_PUBLIC_AUTH_URL`, baked into the client bundle at build time). A
 * server-side render, however, runs inside the web container, where that public
 * origin can be unreachable — under docker-compose `http://localhost:4000`
 * resolves to the web container itself, not the API service. `INTERNAL_API_URL`
 * (server-only, runtime, deliberately NOT a `NEXT_PUBLIC_*` var so it never
 * enters the client bundle) names the API as seen from the server. It is the
 * single internal origin for both the read API and the auth routes (the API
 * service hosts both), and it is optional: when unset, server fetches fall back
 * to the public origin, so single-origin and real-domain deploys configure
 * nothing.
 */
import { Env } from '../../env';

/**
 * Pure selection of the base URL. Server-side with a configured internal origin
 * uses it; every other case (no internal origin, or the browser) uses the
 * public origin. Extracted from {@link resolveApiBaseUrl} so the four-way table
 * is exhaustively testable without stubbing globals or the env validator.
 */
export function pickBaseUrl(params: {
  readonly isServer: boolean;
  readonly internalUrl: string | undefined;
  readonly publicUrl: string;
}): string {
  const { isServer, internalUrl, publicUrl } = params;
  return isServer && internalUrl !== undefined ? internalUrl : publicUrl;
}

/**
 * Resolve the base origin for a fetch, given the caller's public origin
 * (`NEXT_PUBLIC_API_URL` for read calls, `NEXT_PUBLIC_AUTH_URL` for auth calls).
 * On the server, `INTERNAL_API_URL` overrides it when set.
 */
export function resolveApiBaseUrl(publicUrl: string): string {
  return pickBaseUrl({
    isServer: typeof window === 'undefined',
    internalUrl: Env.INTERNAL_API_URL,
    publicUrl,
  });
}
