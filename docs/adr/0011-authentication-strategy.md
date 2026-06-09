# ADR 0011: Authentication strategy

Date: 2026-05-15
Status: Accepted

## Context

Phase 4 introduces authentication. TOOPO needs email + password with
mandatory email verification, optional Google OAuth, RGPD-friendly
sessions (no third-party banner), and a small enough surface that one
developer can audit the entire flow.

The default Node options (NextAuth/Auth.js, Lucia, Iron Session +
hand-rolled OAuth) all had specific friction:

- **NextAuth/Auth.js** assumes Next.js. Splitting our API away from
  Next means an awkward fork.
- **Lucia** is library-mode (you build the routes), which fits but
  doubles the surface we own.
- **Iron Session + DIY OAuth** rebuilds the things authentication
  libraries already solved.

## Decision

Use **Better Auth 1.6.x** as the authentication library, mounted on
`apps/api` at `/v1/auth/*`. Single `auth` instance built with
`betterAuth({...})`, exposed to NestJS via a DI token
(`AUTH_INSTANCE`), and routed by a **raw Fastify catch-all** registered
in `main.ts` after Nest's middleware (helmet, CORS) using
`fromNodeHeaders` from `better-auth/node` to bridge Fastify ↔ Web
`Request`/`Response`. The catch-all bypasses Nest's pipes/interceptors
because Better Auth ships its own validation + error handling.

Configuration choices:

- **Email + password** is the default, with
  `emailAndPassword.requireEmailVerification: true` — users can't
  sign in until they click the verification link.
- **Session cookies** (`better-auth.session_token`, `httpOnly`,
  `SameSite=Lax`, `secure` in production) — not JWTs. Cookies are
  RGPD-friendly (no banner needed for strictly-necessary auth
  cookies), revocable server-side, and avoid the "where do you store
  tokens?" XSS-vs-CSRF debate. The web app uses `credentials: 'include'`
  on every auth fetch.
- **Conditional Google OAuth**: `socialProviders.google` is registered
  only when both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are
  set. The web button is gated by `NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED`
  (deliberately separate flag — server creds aren't visible to the
  browser).
- **Email delivery** uses Resend when `RESEND_API_KEY` is configured,
  and falls back to structured Pino logs otherwise — a fresh clone
  exercises the full signup flow without a Resend account.

## Consequences

- One library, audited surface, well-documented protocol. Upgrades
  follow the schema review checklist in ADR-0012 (hand-written
  schema discipline).
- The Fastify catch-all bypasses our `GlobalExceptionFilter`. Better
  Auth's error responses follow its own shape — clients consuming
  `/v1/auth/*` must handle that shape directly. The rest of the API
  remains under the Nest filter and emits the standard
  `ErrorResponse` envelope.
- Adding a second OAuth provider is a server-side env addition + a
  new `NEXT_PUBLIC_<PROVIDER>_OAUTH_ENABLED` flag.

## Alternatives considered

- **JWT-based sessions**: rejected. Revocation needs a denylist; XSS
  vs CSRF tradeoff has no clean answer; RGPD posture is murkier.
- **NextAuth on web only**: rejected. The API also needs to know who
  is calling it; splitting auth state between web and API doubles the
  failure modes.
- **Lucia**: viable. Better Auth had richer plugins (organization, 2FA,
  passkeys) we expect to need in later phases; Lucia would require
  more glue per phase.

## Operational notes

### Email enumeration protection (Phase 4.1, bug B7 verification)

Sign-up against an already-registered email returns a synthetic 200
response (Better Auth's email enumeration protection, aligned with OWASP
authentication guidelines). The duplicate signup attempt does NOT modify
the database — the response id is synthetic. See
`better-auth/dist/api/routes/sign-up.mjs:160-206` for the upstream source.

This protection activates when `emailAndPassword.requireEmailVerification`
is `true` (our default) or `emailAndPassword.autoSignIn` is `false`. The
sign-up response shape is identical between new and existing emails so an
attacker cannot probe the user table by signup attempts.

We wire `emailAndPassword.onExistingUserSignUp` to a Pino `warn` log
(`event: 'auth.signup.existing_email'`) so that enumeration attempts are
observable in metrics/logs without altering the protection itself. Phase
4.1 verified empirically (DB inspection + source quote) that no row is
created or replaced by a duplicate signup.

### Future hardening hooks

Future hardening can wire `emailAndPassword.onExistingUserSignUp` further:

- **(a)** Notify the legitimate owner via email ("someone tried to register
  with your address") using the existing `AuthEmailService`. Requires a
  new email template + sends additional email volume.
- **(b)** Feed into rate-limiting metrics: count `auth.signup.existing_email`
  warns per IP / per email and trip a circuit breaker on burst. Pairs well
  with a future signup rate-limit middleware.

Neither is in Phase 4.1 scope; both are tracked here for the next
auth-hardening session.

## Soft-delete authentication boundary

`user.deleted_at` is a custom column outside the Better Auth canonical
schema (see ADR-0013 for the RGPD rationale). Better Auth has no
intrinsic awareness of soft-deleted users, so without an explicit hook
a soft-deleted account remains fully signin-able — `softDeleteUser`
flips `deleted_at` and revokes existing sessions, but the next
`sign-in/email` happily re-creates one. This was discovered live in
Phase 4.1.6 (B10) and is a direct RGPD Article 17 failure.

**Canonical enforcement point** — `databaseHooks.session.create.before`
in `apps/api/src/modules/auth/auth.factory.ts`. The hook is extracted
as `createSessionCreateBeforeHook` in `auth.soft-delete-guard.ts` for
isolated unit testing (the betterAuth({…}) config is awkward to drive
in tests). On a soft-deleted user, the hook throws an `APIError` with
the exact `UNAUTHORIZED` / `INVALID_EMAIL_OR_PASSWORD` shape Better
Auth emits for a wrong-password attempt. Consistent failure modes
prevent leaking the existence of a deleted account through a
distinguishable error surface (OWASP-aligned, same intent as the
existing email-enumeration protection above).

**Defense-in-depth** — `SessionGuard` re-checks `user.deleted_at` on
every request via `UserService.isActive`. In steady state the hook
prevents the case from ever reaching the guard (a session row cannot
be created for a deleted user, and `softDeleteUser` already purges
existing sessions in a transaction). The guard exists for the edge
cases the hook cannot cover: a Better Auth upgrade that bypasses our
hook, a manual DB write outside the API, or a future code path that
calls the adapter directly. The guard's failure shape matches its
existing "no session" branch (`UnauthorizedException('Session required')`)
so soft-deleted users see the same response as unauthenticated users.

**Endpoint defensive check** — `UserController.dataExport` additionally
calls `UserService.isActive` before returning data. The guard would
have caught this case, so the controller check is a documentation
artifact: the soft-delete contract is visible at the endpoint that
surfaces the most sensitive payload, alongside its RGPD comment.

**Maintenance requirement** — any new authentication path (OAuth
provider, magic link, SSO, API key, …) must be exercised against a
soft-deleted user to confirm the hook fires. The hook is wired at the
session-create layer, so all auth methods that end up issuing a
session benefit automatically; methods that bypass session creation
(if any are added) need their own soft-delete check.

## Email callback URLs route to frontend

Better Auth's email-triggering endpoints (`signUp.email` with
`requireEmailVerification`, `sendVerificationEmail`, `requestPasswordReset`,
`signIn.email` when `sendOnSignIn: true` re-issues a verification email)
embed a `callbackURL` (verify-email) or `redirectTo` (password reset)
query parameter inside the URL placed in the outgoing email. Once the
user clicks the link, Better Auth validates the token at
`{baseURL}/v1/auth/<flow>` and issues a 302 to that embedded value.

**Canonical pattern — frontend callers pass absolute URLs.**

The `forgot-password-form` is the reference (already shipped before
Phase 4.1.7):

```ts
redirectTo: `${window.location.origin}/${locale}/reset-password`,
```

All other email-triggering call sites — `signUp.email`, `signIn.email`,
`sendVerificationEmail`, `signIn.social` (Google) — follow the same shape.
Concrete current destinations (post-Phase 4.1.7):

| Call site                                  | Destination                                                 |
| ------------------------------------------ | ----------------------------------------------------------- |
| `signUp.email`                             | `${origin}/${locale}/verify-email?verified=1`               |
| `sendVerificationEmail` (resend)           | `${origin}/${locale}/verify-email?verified=1`               |
| `signIn.email`                             | `${origin}/${locale}/account`                               |
| `signIn.social` (Google, signin & signup)  | `${origin}/${locale}/account`                               |
| `requestPasswordReset`                     | `${origin}/${locale}/reset-password`                        |

`signIn.email`'s `callbackURL` has **dual semantics**: for a verified
user the value is the post-signin redirect destination; for an unverified
user `sendOnSignIn: true` re-issues the verification email and embeds
the value there. Routing it to `/account` works for both branches because
Better Auth's verify-email endpoint creates a session as part of its 302,
so an unverified user clicking the re-sent link arrives at `/account`
already signed in.

**Rationale.**

- **UX continuity.** A relative path (e.g. `` `/${locale}/` ``) is resolved
  by Better Auth against `BETTER_AUTH_URL` (the API origin), so the
  302 lands on `localhost:4000/en/` which has no route — a hard 404 the
  user cannot recover from. Phase 4.1.6 found this as finding B9 across
  every email-triggering site except `forgot-password-form`.
- **Locale handling.** The frontend route segment (`/en/…`, `/fr/…`)
  must survive the round-trip through the API so the post-redirect page
  renders in the locale the user started in.
- **Error UI.** Better Auth's `/v1/auth/verify-email` endpoint
  empirically returns 302 with `error=TOKEN_EXPIRED` or
  `error=INVALID_TOKEN` query params appended to the supplied
  `callbackURL` when the token is invalid or already consumed
  (verified live in Phase 4.1.7 Phase E smoke). The frontend
  `verify-email` page must therefore branch on `?error=` **before**
  `?verified=1`, because Better Auth preserves the original
  `?verified=1` from `callbackURL` and tacks `error=…` on top.

### Email URL ownership (B13)

Phase 4.1.8 finding B13: even with the B9 fix in place, the URL Better
Auth embedded in the email button still pointed at the API hostname
(`${BETTER_AUTH_URL}/verify-email?token=…` and
`${BETTER_AUTH_URL}/reset-password/:token`). The B9 rewrite only fixed
the `callbackURL` *query parameter*, not the host of the link itself.
In production this would expose `api.toopo.io` to end users in their
inbox — a visible coupling we want to avoid.

Better Auth 1.6.11 has no config to override the URL host
(`dist/api/routes/email-verification.mjs:29` and
`dist/api/routes/password.mjs:72` hard-code `${ctx.context.baseURL}`).
But it passes the raw `token` as a separate argument to
`sendVerificationEmail({ user, url, token })` and
`sendResetPassword({ user, url, token })`. We therefore ignore the
generated `url` and construct our own using
`apps/api/src/modules/auth/email/url-builders.ts`:

- `buildVerifyEmailUrl({ token, locale, frontendOrigin })`
  → `${frontendOrigin}/${locale}/verify-email?token=${token}`
- `buildResetPasswordUrl({ token, locale, frontendOrigin })`
  → `${frontendOrigin}/${locale}/reset-password?token=${token}`

The frontend `/verify-email` page reads the token on mount and calls
`authClient.$fetch('/verify-email', { query: { token } })` to validate.
The frontend `/reset-password` page already calls
`authClient.resetPassword({ token, newPassword })` with the token from
the URL — that pattern is unchanged.

The B9 helper (`forceAbsoluteCallback`) was deleted in this same
change: it became dead defense once we own URL construction end to
end rather than rewriting Better Auth-generated values.

**Backwards compatibility.** The backend GET endpoints
(`/v1/auth/verify-email`, `/v1/auth/reset-password/:token`) are
unchanged and remain active. Emails generated before B13 still
validate — they route via backend → frontend with a 302 to the
`callbackURL`/`redirectTo` originally passed. End-user experience is
identical for old emails (lands on the same success page); only the
visible button URL differs.

## Cross-browser email verification behavior

Better Auth's `/v1/auth/verify-email` endpoint creates a session as
part of its success response and 302s to the supplied `callbackURL`.
The session cookie is set on the 302 — meaning **the click that
verifies the email must happen in the same browser context as the
sign-up** for the user to land on `/account` already signed in.

If the user clicks the verification link in a different browser, a
private/incognito window, or on another device:

- The verification itself still succeeds: the token is consumed, the
  user row's `emailVerified` flag is set to `true`, and the 302 lands
  on the success page (`/${locale}/verify-email?verified=1`).
- No session cookie is set in that other browser context (Better Auth
  has no way to bind the verifying request to the original sign-up's
  cookie jar).
- The user must sign in manually after seeing the success page.
  Sign-in works immediately because the account is now verified —
  there is no second verification round-trip.

This is **deliberate behavior**, not a defect:

- Binding a session to an email link click would require either
  embedding session credentials in the email URL (a long-lived secret
  vulnerable to email forwarding, browser history, and inbox
  compromise) or a server-side correlation table keyed on something
  like a browser fingerprint — extra surface for marginal UX gain.
- The "click in same browser" path is the dominant case (the user
  just signed up in this browser; the email arrives within seconds).
  The cross-browser case is a recoverable corner — one extra sign-in
  click on the success page.
- The behavior is symmetric with `signIn.email` when
  `sendOnSignIn: true` re-issues a verification email: the resulting
  click also lands at `/account` signed in only when same-browser.

Phase 4.1.6 finding B12 surfaced this during a multi-browser smoke
test. This section documents the contract so future contributors
don't try to "fix" the cross-browser auto-sign-in path as a UX
improvement.

## Error envelope divergence for /v1/auth/*

Better Auth ships its own error envelope on its `/v1/auth/*` routes
(`{ code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" }`)
rather than the TOOPO-canonical `ErrorResponse`
(`{ code: "UNAUTHORIZED", message, requestId }` defined in
`@toopo/api-contracts`). This is a **deliberate divergence**, not a
missed transform.

**Why we keep it.**

- The Better Auth handler is mounted as a raw Fastify catch-all
  (`apps/api/src/modules/auth/auth.fastify-bridge.ts`) precisely so the
  library owns its request lifecycle end to end. Re-shaping its body
  on the way out would require parsing and re-emitting every error
  variant Better Auth knows about — a fragile coupling that breaks on
  every patch release.
- Better Auth's error codes (`INVALID_EMAIL_OR_PASSWORD`,
  `INVALID_TOKEN`, `TOKEN_EXPIRED`, …) are richer than our
  HTTP-status-derived `ErrorCode` enum and carry information the
  frontend's auth UI relies on (different messages for
  expired-vs-invalid token, for instance). Coercing them into our
  smaller enum would lose semantic resolution.
- The frontend's `authClient` (Better Auth React) already understands
  the native shape. Forcing it through our envelope would mean
  reinventing client-side error-code routing for marginal uniformity
  gain.

**Where we DO emit the TOOPO envelope on /v1/auth/*:**

`buildAuthErrorResponse` in `auth.fastify-bridge.ts` substitutes our
envelope only when Better Auth returns a non-2xx response with a null
body, or when the Fastify catch-all itself throws. Those are
TOOPO-side failures (not Better Auth's reasoned rejections), so the
TOOPO envelope is the right contract there. See Phase 4.1 finding B2.

**Frontend implication.** Any code that consumes `/v1/auth/*`
responses — forms in `apps/web/src/app/[locale]/(auth)/*`, session
checks in `account-actions.tsx`, etc. — must handle Better Auth's
native shape, not the TOOPO `ErrorResponse` shape. The two envelopes
do not overlap on the wire and clients must branch on path rather
than on envelope autodetection.

Phase 4.1.6 finding O2 surfaced this asymmetry during a contract
audit; this section documents the decision so future contributors
don't try to "fix" the divergence as a quality-of-life win.

## Related ADRs

- ADR-0012 (database choice) — the schema feeding Better Auth's
  Drizzle adapter, and why we hand-write rather than CLI-generate.
- ADR-0013 (RGPD compliance) — the data-export + soft-delete
  endpoints that depend on this session model, and the
  re-authentication block that closes the Phase 4.1.6 B10 gap.
- ADR-0008 (env validation at module load) — `BETTER_AUTH_SECRET`
  and `DATABASE_URL` validate eagerly; the auth instance fails fast
  on misconfiguration.
