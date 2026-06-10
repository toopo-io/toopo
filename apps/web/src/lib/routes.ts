import { ROUTE_SEGMENTS } from '@toopo/api-contracts';

// Single source of truth for every internal route URL the web app builds.
//
// Every internal URL must come from `routes`, `absoluteRoutes`, or
// `protectedPathPrefixes` — never from a literal `/signin`,
// `/${locale}/account`, etc. in a component or page. The segment values
// themselves come from `@toopo/api-contracts` `ROUTE_SEGMENTS`, which the
// backend `url-builders.ts` also consumes for the URLs Better Auth emails
// to users (see ADR-0011 §Email URL ownership). Renaming a route is a
// two-file change: update `ROUTE_SEGMENTS` in api-contracts, optionally
// rename the helper here. See ADR-0014 for the full pattern.

/**
 * Relative routes — for Next.js `<Link href>`, `router.push`, `redirect()`,
 * and anything else that takes an in-app path.
 */
export const routes = {
  signin: (locale: string): string => `/${locale}/${ROUTE_SEGMENTS.SIGNIN}`,

  /** Sign-in with a `next=` redirect target (used by the auth guard). */
  signinNext: (locale: string, next: string): string =>
    `/${locale}/${ROUTE_SEGMENTS.SIGNIN}?next=${encodeURIComponent(next)}`,

  /** Sign-in landing page after a successful email verification. */
  signinAfterVerify: (locale: string): string => `/${locale}/${ROUTE_SEGMENTS.SIGNIN}?verified=1`,

  /** Sign-in landing page after a successful password reset. */
  signinAfterReset: (locale: string): string => `/${locale}/${ROUTE_SEGMENTS.SIGNIN}?reset=1`,

  signup: (locale: string): string => `/${locale}/${ROUTE_SEGMENTS.SIGNUP}`,

  account: (locale: string): string => `/${locale}/${ROUTE_SEGMENTS.ACCOUNT}`,

  verifyEmail: (locale: string): string => `/${locale}/${ROUTE_SEGMENTS.VERIFY_EMAIL}`,

  /** Pending-verification page prefilled with the user's email. */
  verifyEmailWithEmail: (locale: string, email: string): string =>
    `/${locale}/${ROUTE_SEGMENTS.VERIFY_EMAIL}?email=${encodeURIComponent(email)}`,

  forgotPassword: (locale: string): string => `/${locale}/${ROUTE_SEGMENTS.FORGOT_PASSWORD}`,

  resetPassword: (locale: string): string => `/${locale}/${ROUTE_SEGMENTS.RESET_PASSWORD}`,

  /** The project picker — the instance's connected repos (ADR-0022 §5). */
  projects: (locale: string): string => `/${locale}/${ROUTE_SEGMENTS.PROJECTS}`,

  /** The cartography explorer for a selected project (ADR-0020 read API, ADR-0022). */
  projectGraph: (locale: string, projectId: string): string =>
    `/${locale}/${ROUTE_SEGMENTS.PROJECTS}/${encodeURIComponent(projectId)}/${ROUTE_SEGMENTS.GRAPH}`,
} as const;

/**
 * Absolute routes — for Better Auth `callbackURL` / `redirectTo` which
 * require fully-qualified URLs (Better Auth's `originCheck` middleware
 * rejects relative paths). The caller passes the origin so this module
 * stays usable from both server and client components — server components
 * cannot read `window.location.origin`.
 */
export const absoluteRoutes = {
  account: (origin: string, locale: string): string => `${origin}${routes.account(locale)}`,

  /**
   * Verify-email "done" landing URL used as the `callbackURL` for the
   * legacy backend-redirect flow. Post-B13, new emails point straight to
   * `routes.verifyEmail(locale)` with a token, so this is only consumed
   * by `authClient.signUp.email({ callbackURL })` for compatibility with
   * Better Auth's redirect on the resend-verification path.
   */
  verifyEmailDone: (origin: string, locale: string): string =>
    `${origin}/${locale}/${ROUTE_SEGMENTS.VERIFY_EMAIL}?verified=1`,

  resetPassword: (origin: string, locale: string): string =>
    `${origin}${routes.resetPassword(locale)}`,
} as const;

/**
 * Locale-stripped path prefixes consumed by the middleware/proxy
 * layer (`proxy.helpers.ts`) to decide which requests require an
 * authenticated session. Listed without the locale segment because
 * `proxy.ts` strips it before dispatching.
 */
export const protectedPathPrefixes: readonly string[] = [
  `/${ROUTE_SEGMENTS.ACCOUNT}`,
  // The whole project surface — the picker and every `/projects/:id/graph` — is
  // gated: the graph holds the user's private code (ADR-0022 §5, Fork 5).
  `/${ROUTE_SEGMENTS.PROJECTS}`,
];
