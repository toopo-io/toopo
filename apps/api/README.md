# @toopo/api

NestJS 11 backend running on Fastify with swc build.

## Stack

- **NestJS 11** with `@nestjs/platform-fastify` (5x faster than Express).
- **swc** as the build compiler via `nest-cli.json` `"builder": "swc"`.
- **Module system**: CommonJS (most stable with reflect-metadata + decorators).
- **Logger**: `nestjs-pino` — structured JSON in production, pretty-printed in dev.
- **Validation**: `nestjs-zod` — global pipe + serialization interceptor using
  schemas from `@toopo/api-contracts`.
- **OpenAPI**: `@nestjs/swagger` + `nestjs-zod`'s `cleanupOpenApiDoc()`. UI at `/docs`.
- **Config**: `@nestjs/config`. Env is validated once at module load by the
  `Env` singleton in `src/env.ts` (required because `main.ts` reads
  `PORT`/`CORS_ORIGIN` before Nest bootstrap).
- **Tests**: Vitest (unit + E2E via `NestFastifyApplication.inject()` against the Fastify HTTP server).
- **i18n**: `i18next` 26 with **embedded** JSON resources (no fs
  backend — see [ADR-0003](../../docs/adr/0003-nestjs-cjs-versus-esm.md)
  addendum). A `LocaleInterceptor` reads `Accept-Language`, attaches
  `request.locale`, and sets `Content-Language` on the reply. The
  `GlobalExceptionFilter` translates Zod issues and transport errors
  via the `I18nService` using the request's locale. See
  [ADR-0009](../../docs/adr/0009-i18n-strategy.md).

## Run locally

```bash
cp .env.example .env
pnpm install
pnpm --filter @toopo/api dev
```

The API listens on `http://localhost:4000` and serves OpenAPI at
`http://localhost:4000/docs`.

- `GET /v1/health` returns a `HealthCheckResponse` matching the
  schema in `@toopo/api-contracts`.

### i18n keys

The translation catalog lives as a **TypeScript module** at
`src/i18n/locales/en.ts` (source of truth, typed `as const
satisfies LocaleCatalog`). The shape feeds i18next's
`CustomTypeOptions` via `src/i18n/i18n.types.ts` — using a key that
doesn't exist is a compile error. English is the only active locale
(ADR-0018); a future locale is added as a sibling `.ts` module typed
`CatalogShape<ApiCatalog>`, so any structural drift from en is a
compile error. See [ADR-0010](../../docs/adr/0010-asset-bundling-strategy.md)
for why catalogs are `.ts` and not `.json`.

## Environment variables

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `NODE_ENV` | `'development' \| 'production' \| 'test'` | `development` | Runtime mode |
| `LOG_LEVEL` | `'debug' \| 'info' \| 'warn' \| 'error'` | `info` | Pino log level |
| `PORT` | `number` | `4000` | Listen port |
| `CORS_ORIGIN` | URL | `http://localhost:3000` | Allowed CORS origin |
| `DATABASE_URL` | postgres URL | — | Neon Postgres pooled connection string |
| `BETTER_AUTH_SECRET` | string ≥ 32 chars | — | Better Auth signing secret (`openssl rand -base64 32`) |
| `BETTER_AUTH_URL` | URL | — | Public API URL (kept separate from `CORS_ORIGIN` for future subdomain split) |
| `RESEND_API_KEY` | string | — (optional) | Resend API key — falls back to Pino logger if unset |
| `RESEND_FROM_EMAIL` | email | `onboarding@resend.dev` | Sender address |
| `RESEND_FROM_NAME` | string | `Toopo` | Sender display name |
| `GOOGLE_CLIENT_ID` | string | — (optional) | Google OAuth client ID (both `_ID` + `_SECRET` required) |
| `GOOGLE_CLIENT_SECRET` | string | — (optional) | Google OAuth client secret |
| `GITHUB_WEBHOOK_SECRET` | string ≥ 16 chars | — (optional) | GitHub-App webhook secret. When unset the webhook fails closed (`503`); see [ADR-0024](../../docs/adr/0024-github-push-webhook-ingestion.md) |

All env vars are validated at boot by `createEnvValidator(ApiEnvSchema)`.
Boot fails fast with a readable error if any are missing or invalid.

## Project layout

```
src/
├── core/             # Cross-cutting concerns (config, logger, filters)
├── modules/
│   └── health/       # Liveness/readiness probe (more modules in later phases)
├── app.module.ts     # Root module
├── env.ts            # Validated env singleton (fail-fast at module load)
└── main.ts           # Fastify bootstrap (helmet, CORS, versioning, Swagger)
test/                 # E2E specs (*.e2e-spec.ts)
```

`shared/` (helpers across modules) and `modules/billing/` are planned
for later phases and not yet on disk. `modules/auth/` is wired in
Phase 4.

## Authentication

Better Auth is mounted on `/v1/auth/*` as a raw Fastify catch-all
(see `src/main.ts`) using its Kysely adapter over `@toopo/db`'s shared
connection (`createAuthDatabase`, backend selected by the `DATABASE_URL`
scheme — SQLite self-host / Postgres cloud). The default flow is email +
password with mandatory email verification.
Email delivery falls back to Pino logger when `RESEND_API_KEY` is
unset (see `src/modules/auth/email/email.service.ts`) so a fresh
clone runs end-to-end without a Resend account.

### Google OAuth (optional)

The Google social provider is registered **server-side** only when
**both** `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are present in
the environment. If either is missing, Better Auth does not expose
`/v1/auth/sign-in/social` for Google and the `account` table never
receives `providerId='google'` rows.

The web app gates the Google sign-in button on the public
`NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED` flag — a deliberately separate
toggle because the server-side `GOOGLE_CLIENT_ID` is not visible to
the browser. Operators must set both surfaces consistently:

- API env: `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` filled in.
- Web env: `NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED=true`.

Setting only the web flag without server credentials produces a
button that always fails. Setting only the server credentials hides
the button — sign-in via Google is still reachable by URL but not
discoverable in the UI. Both states are documented as misconfigured
in CI checks added later.

### Email delivery (dual-mode)

`apps/api/src/modules/auth/email/email.service.ts` wraps Resend. The
constructor reads `Env.RESEND_API_KEY`:

- **Defined** → instantiates Resend; `sendVerificationEmail` /
  `sendResetPasswordEmail` send real emails.
- **Undefined** → leaves the client `null`; calls fall through to
  `logger.warn({ to, kind, subject }, ...)` so a fresh clone exercises
  the full signup flow without a Resend account.

Templates are `.ts` modules under
`src/modules/auth/email/templates/` (per ADR-0010 category 1). Each
`(kind, locale)` pair has its own file. Locale resolution per request
goes through `@toopo/i18n`'s `negotiateLocale` on the Web `Request`'s
`Accept-Language` header — same chain as the existing
`LocaleInterceptor`.

### Signup flow

```
POST /v1/auth/sign-up/email
  body: { name, email, password, callbackURL }
   |
   v
Better Auth: validate → INSERT user (emailVerified=false)
                      → INSERT verification token
                      → call emailVerification.sendVerificationEmail
                        → AuthEmailService.sendVerificationEmail
                            → Resend OR Pino fallback
   |
   v
Return { user: { ..., emailVerified: false }, session: null }
   |
   v
[web] router.push(`/${locale}/verify-email?email=...`)
```

The user clicks the link in the email:

```
GET /v1/auth/verify-email?token=...&callbackURL=/{locale}/
   |
   v
Better Auth: verify token → UPDATE user SET emailVerified=true
                          → INSERT session (auto sign-in)
                          → Set-Cookie: better-auth.session_token
   |
   v
302 -> /{locale}/
```

### Signin flow

```
POST /v1/auth/sign-in/email
   |
   v
Better Auth: verify password
             → if user.emailVerified=false, 403 + resend verification
             → else INSERT session + Set-Cookie
   |
   v
Return { user, session }
```

### Session check (server-side in apps/web)

```
[web SSR] cookies() -> "better-auth.session_token=..."
   |
   v
fetch(`${NEXT_PUBLIC_AUTH_URL}/v1/auth/get-session`, { headers: { cookie } })
   |
   v
Better Auth: read cookie -> SELECT session JOIN user
   |
   v
Return { user, session } | null
```

`apps/web/src/lib/server-session.ts` wraps this for `/account` (and
future protected pages). The proxy (`apps/web/src/proxy.ts`) does a
**cookie-existence** gate before invoking the page, redirecting to
`/signin` if the cookie is absent (no API roundtrip in middleware).

## RGPD endpoints

`modules/user/` exposes two authenticated endpoints, gated by
`SessionGuard` (which calls `auth.api.getSession({ headers })` and
attaches the session via `@CurrentSession()`):

- `GET /v1/user/data-export` — JSON download containing the user
  record, sessions (without tokens), and accounts (without secrets).
  Response is served with `Content-Disposition: attachment;
  filename="toopo-data-export.json"`.
- `DELETE /v1/user/me` — soft-delete. Sets `user.deleted_at = NOW()`
  and revokes all sessions in a single transaction. Hard-delete after
  30 days is documented but unimplemented (no cron infra yet, see
  [ADR-0013](../../docs/adr/0013-rgpd-compliance.md)).

The web `/account` page surfaces both as visible actions with localized
confirmation copy (`Auth.account.export.*`, `Auth.account.delete.*`).

## GitHub push webhook

`modules/webhooks/` exposes a single thin endpoint
(`POST /v1/webhooks/github`) that turns a GitHub push into a
reference-only ingest job on the `@toopo/queue` producer (consumed by the
worker in a later slice). It is the public, unauthenticated edge of the
ingest pipeline, so signature verification is the first thing that runs
(see [ADR-0024](../../docs/adr/0024-github-push-webhook-ingestion.md)):

- **Verify-before-processing gate.** A `GithubSignatureGuard` runs before
  the controller and verifies `X-Hub-Signature-256` as the HMAC-SHA256 of
  the **raw** request body under `GITHUB_WEBHOOK_SECRET`, compared in
  constant time (`crypto.timingSafeEqual`, length-checked so it never
  throws). Missing → `401`, mismatch/tampered/wrong-algorithm → `403`,
  secret unset → `503` (fail closed). No resolve, no enqueue, no work runs
  for a bad signature. The raw body is captured via Nest's `rawBody: true`
  and the JSON body parser limit is raised to **25 MiB** — GitHub's maximum
  deliverable payload — so a legitimate large push is never `413`'d.
- **Scope.** Only a `push` to the repository's `default_branch` that is not
  a branch delete enqueues. `ping`, other events, non-default branches,
  tags, and deletes are acknowledged `200` with no enqueue.
- **Resolve-existing-only.** The repo coordinates resolve an existing
  project via `findProjectByRepo` against the canonical host `github.com`.
  A miss is acknowledged `200` and logged — project creation belongs to the
  GitHub-App install/connect flow (a later slice), never the webhook.
- **Reference-only, deduped.** The job carries `{ projectId, repo, commitSha }`
  — a reference, never the code — with `dedupeKey = ${projectId}:${commitSha}`
  so GitHub's redeliveries coalesce to one logical job.

A malformed push payload is rejected `400` (validated with Zod against the
exact verified bytes). The secret is read from validated `Env` and never
logged; only the delivery id and event appear in logs.

## Related ADRs

- [ADR-0011](../../docs/adr/0011-authentication-strategy.md) —
  Better Auth, sessions, Fastify mount.
- [ADR-0017](../../docs/adr/0017-storage-strategy.md) — storage: Kysely
  dual-backend (SQLite self-host / Postgres cloud); supersedes ADR-0012.
- [ADR-0013](../../docs/adr/0013-rgpd-compliance.md) — data export,
  soft delete, cookie posture.
- [ADR-0024](../../docs/adr/0024-github-push-webhook-ingestion.md) —
  GitHub push-webhook ingestion: verify-before-processing gate,
  resolve-existing-only, default-branch scope, reference-only enqueue.
