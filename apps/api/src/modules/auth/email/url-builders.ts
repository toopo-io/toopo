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
// ownership.
//
// Route segments (`verify-email`, `reset-password`) come from
// `@toopo/api-contracts` `ROUTE_SEGMENTS` so backend email URLs and the
// frontend page paths stay aligned by construction.

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

export interface BuildAcceptInvitationUrlOptions {
  invitationId: string;
  locale: string;
  frontendOrigin: string;
}

// The workspace-invitation accept link (ADR-0028, Phase 4). Like the auth emails
// above, we own the frontend URL via ROUTE_SEGMENTS rather than letting the
// generated API URL leak the backend host into the invitee's inbox. The
// invitation `id` (not a token) is the identifier Better Auth's accept endpoint
// expects.
export function buildAcceptInvitationUrl({
  invitationId,
  locale,
  frontendOrigin,
}: BuildAcceptInvitationUrlOptions): string {
  const origin = trimTrailingSlash(frontendOrigin);
  const encodedId = encodeURIComponent(invitationId);
  return `${origin}/${locale}/${ROUTE_SEGMENTS.ACCEPT_INVITATION}?id=${encodedId}`;
}
