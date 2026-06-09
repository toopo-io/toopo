# ADR 0013: RGPD compliance approach

Date: 2026-05-15
Status: Accepted

## Context

TOOPO operates in the EU and falls under the RGPD (GDPR) regime. The
relevant rights for Phase 4 are:

- **Right of access** (Art. 15): the user can ask for a copy of all
  personal data we hold.
- **Right to erasure** (Art. 17, "right to be forgotten"): the user
  can ask us to delete their data.
- **Right to be informed** (Art. 13): emails we send must include the
  identity of the controller and how to exercise these rights.

We also want **no consent banner** for strictly-necessary cookies,
which depends on our cookie choices.

## Decision

### Right of access: `GET /v1/user/data-export`

Authenticated endpoint. Returns a JSON download of:

- The user record (`id`, `name`, `email`, `emailVerified`, `image`,
  `createdAt`, `updatedAt`).
- All their session rows minus the token bytes (we return `id`,
  `expiresAt`, `createdAt`, `updatedAt`, `ipAddress`, `userAgent`).
- All their account rows minus credential material (we return `id`,
  `providerId`, `accountId`, `createdAt`, `updatedAt` — no password
  hash, no access/refresh tokens, no id tokens).

The Content-Disposition is `attachment; filename="toopo-data-export.json"`
so browsers save instead of render. The `/account` page in `apps/web`
exposes a button that triggers the download.

### Right to erasure: `DELETE /v1/user/me`

Authenticated endpoint. Performs:

1. `UPDATE user SET deleted_at = NOW() WHERE id = $1`.
2. `DELETE FROM session WHERE user_id = $1` (logs the user out
   everywhere).

Wrapped in a single transaction. Returns
`{ ok: true, deletedAt: <ISO> }`.

**30-day grace period**: rows are kept for 30 days after `deleted_at`
is set. Within that window, the user can contact support to undo the
deletion. After 30 days, a scheduled job (not yet implemented — see
"Operational gap" below) performs the hard delete.

The `account` rows are cascade-deleted via the foreign key when the
user row is eventually hard-deleted. Until then, they remain
referenced.

### Re-authentication after soft-delete is blocked

A soft-deleted user **cannot sign back in**. Without enforcement, the
deletion would be cosmetic: `deleted_at` would be set, existing
sessions revoked, and the next `POST /v1/auth/sign-in/email` would
happily issue a fresh session — exactly the failure mode Article 17
forbids. This was discovered live in Phase 4.1.6 (B10) before the
behavior reached production.

Enforcement lives at three layers:

1. **Better Auth `databaseHooks.session.create.before`** —
   `apps/api/src/modules/auth/auth.factory.ts` rejects session
   creation for any user with `deleted_at IS NOT NULL`, throwing the
   same `UNAUTHORIZED` / `INVALID_EMAIL_OR_PASSWORD` error as a wrong
   password. The shape match prevents leaking the existence of a
   deleted account through a distinguishable error. This is the
   canonical enforcement point.
2. **`SessionGuard`** re-checks `user.deleted_at` on every protected
   request as defense-in-depth.
3. **`UserController.dataExport`** explicitly re-checks before
   returning data — a documentation artifact at the endpoint with the
   most sensitive payload.

A structured Pino warn (`event: auth.signin.soft_deleted_blocked`)
fires on every blocked attempt so re-auth attempts against deleted
accounts are visible in logs/metrics.

**Maintenance checklist** — any new authentication path (OAuth
provider, magic link, SSO, API key, …) must be exercised against a
soft-deleted user to verify the hook fires. Methods that issue a
session benefit automatically because the hook runs at session
creation. Methods that bypass session creation (if any are ever
added) need their own explicit soft-delete check. See ADR-0011
"Soft-delete authentication boundary" for the canonical contract.

### Cookie posture: no banner

Session cookies are **strictly necessary** for the service to
function — the CNIL guidance and RGPD recital 30 exempt
strictly-necessary cookies from the consent requirement. We use:

- `better-auth.session_token`: session cookie, `httpOnly`,
  `SameSite=Lax`, `secure` in production.
- No analytics, advertising, or fingerprinting cookies — these would
  require a banner.

If we add analytics later, the banner becomes mandatory and lands in
a separate ADR.

### Email content

Every transactional email (verification, password reset) includes:

- The TOOPO identity (sender name + address).
- The recipient address.
- A line on what the email is for and how to ignore if not requested.
- Plain-text fallback for clients that don't render HTML.

Templates live in `apps/api/src/modules/auth/email/templates/`
(see ADR-0009 and ADR-0010 for the i18n + asset bundling rationale).

### Discoverability from `/account`

The `/account` page exposes both rights as visible actions:

- "Export my data" — triggers the download.
- "Delete my account" — opens an inline confirmation panel before
  calling the endpoint.

Both action labels and confirmation copy are localized (en + fr) per
the Phase 3 every-string-keyed pattern.

## Operational gap (not closed)

The scheduled hard-delete job is **not implemented** in Phase 4.
TOOPO has no cron infrastructure yet — that infrastructure
(scheduler + ops runbook) is its own phase. Until then, soft-deleted
rows accumulate. The risk is bounded: hard-delete is a downstream
operation, the soft-delete already satisfies the user-facing erasure
request, and `users.deleted_at` is indexed for the eventual sweep.

When the cron lands, it will:

1. Select users with `deleted_at < NOW() - 30 days`.
2. Hard-delete them (sessions, accounts cascade via FK).
3. Log the count for audit.

## Consequences

- Two endpoints, one schema column, one index — small surface to
  audit.
- The 30-day grace is documented in the `delete.confirmBody` i18n
  string visible to users at confirmation time.
- Hard-delete is deferred but visible (this ADR, the `deleted_at`
  index, the README).

## Alternatives considered

- **Hard-delete immediately**: removes the grace period; one mistaken
  click is unrecoverable. Worse user experience for a small infra
  saving.
- **Encrypt-at-rest, decrypt-with-user-key**: heavy machinery for a
  Phase-4 SaaS; revisit if we ship E2EE features.

## Related ADRs

- ADR-0011 (authentication strategy — the sessions we revoke)
- ADR-0012 (database — the `deleted_at` column lives in the `user`
  schema there)
- ADR-0009 (i18n — the confirmation copy + email templates)
