import { resolveLocaleFromPath } from '@toopo/i18n';
import { organizationClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import { Env } from '../../env';

// `onRequest` injects `x-toopo-locale` so the API can prioritize the URL-active
// locale over `Accept-Language` for content selection (notably email bodies —
// see ADR-0009 "Locale negotiation priority").
// SSR-safe via the `typeof window` guard; `window.location.pathname` is read at
// request time so client-side navigation never produces a stale value.
export const authClient = createAuthClient({
  baseURL: `${Env.NEXT_PUBLIC_AUTH_URL}/v1/auth`,
  // The organization plugin = Workspace tenancy (ADR-0028). It exposes the
  // membership read seam the shell uses: `organization.list()` (the picker) and
  // `organization.setActive()` (switching the active workspace).
  plugins: [organizationClient()],
  fetchOptions: {
    onRequest(context) {
      if (context.headers.has('x-toopo-locale') || typeof window === 'undefined') {
        return;
      }
      const locale = resolveLocaleFromPath(window.location.pathname);
      if (locale !== undefined) {
        context.headers.set('x-toopo-locale', locale);
      }
    },
  },
});
