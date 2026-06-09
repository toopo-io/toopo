import { ROUTE_SEGMENTS } from '@toopo/api-contracts';

// Build the frontend-facing URLs we embed in verification and password-reset
// emails. Better Auth 1.6.11 always constructs the email `url` as
// `${baseURL}/verify-email?...` or `${baseURL}/reset-password/:token?...`
// (see `dist/api/routes/email-verification.mjs:29` and
// `dist/api/routes/password.mjs:72`), which exposes the API hostname to end
// users in their inbox. We sidestep this by ignoring the generated `url` and
// constructing our own frontend URL using the raw `token` Better Auth passes
// alongside it. The backend GET endpoints remain functional, so older emails
// generated before this change still validate — see ADR-0011 §Email URL
// ownership and the B13 commit body for the maintenance note.
//
// Route segments (`verify-email`, `reset-password`) come from
// `@toopo/api-contracts` `ROUTE_SEGMENTS` so backend email URLs and the
// frontend page paths stay aligned by construction. See Phase 4.1.8a routes
// refactor and `packages/api-contracts/src/routes/routes.ts`.

export interface BuildAuthEmailUrlOptions {
  token: string;
  locale: string;
  frontendOrigin: string;
}

function trimTrailingSlash(origin: string): string {
  return origin.endsWith('/') ? origin.slice(0, -1) : origin;
}

export function buildVerifyEmailUrl({
  token,
  locale,
  frontendOrigin,
}: BuildAuthEmailUrlOptions): string {
  const origin = trimTrailingSlash(frontendOrigin);
  const encodedToken = encodeURIComponent(token);
  return `${origin}/${locale}/${ROUTE_SEGMENTS.VERIFY_EMAIL}?token=${encodedToken}`;
}

export function buildResetPasswordUrl({
  token,
  locale,
  frontendOrigin,
}: BuildAuthEmailUrlOptions): string {
  const origin = trimTrailingSlash(frontendOrigin);
  const encodedToken = encodeURIComponent(token);
  return `${origin}/${locale}/${ROUTE_SEGMENTS.RESET_PASSWORD}?token=${encodedToken}`;
}
