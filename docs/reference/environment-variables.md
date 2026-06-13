# Environment variables

Toopo is configured entirely through environment variables, validated at module load — a missing or malformed required value fails fast rather than failing later ([ADR-0008](../adr/0008-env-validation-at-module-load.md)). The self-host surface is the root [`.env.example`](../../.env.example); copy it to `.env`, set the one required value, and run.

The stack is **fail-closed**: every optional integration stays disabled until you fill it in. Blank means "disabled," never "broken."

## Required

| Variable | Notes |
| --- | --- |
| `BETTER_AUTH_SECRET` | Min 32 characters. The API refuses to boot without it. Generate with `openssl rand -base64 32`. |

## Core

| Variable | Default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development` \| `production` \| `test`. |
| `LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error`. |
| `DATABASE_URL` | `file:/data/toopo.db` | SQLite path or a `postgres://` URL ([ADR-0017](../adr/0017-storage-strategy.md)). |
| `WEB_ORIGIN` | `http://localhost:3000` | The browser-facing URL of the web app. |
| `API_ORIGIN` | `http://localhost:4000` | The browser-facing URL of the API. |
| `TRUST_PROXY` | `false` | Set `true` only behind a TLS-terminating reverse proxy, so the API reads the client IP from `X-Forwarded-For`. Trusting it without a proxy lets a client spoof its IP. |

`INTERNAL_API_URL` is a server-only URL that lets the web app reach the API over the internal compose network during server-side rendering; it is wired to `http://api:4000` in `docker-compose.yml` and falls back to the public `API_ORIGIN` when unset ([ADR-0030](../adr/0030-self-host-deployment-topology.md) §3). It is never a `NEXT_PUBLIC_*` value.

## GitHub App (optional — the connect-a-repo flow)

Unset, the stack runs fully: the connect endpoints and webhook fail closed (`503`) and the worker clones public repos only. All five App fields are optional ([ADR-0026](../adr/0026-github-app-connect-and-installation-auth.md)); see [Connect a repository](../getting-started/connect-a-repo.md) for how to obtain them.

| Variable | Consumed by | Notes |
| --- | --- | --- |
| `GITHUB_APP_ID` | api, worker | The App's numeric id. |
| `GITHUB_APP_PRIVATE_KEY` | api, worker | The PEM, **base64-encoded** (decoded at the boundary; ADR-0026 §7). |
| `GITHUB_APP_CLIENT_ID` | api | OAuth client id for the install redirect. |
| `GITHUB_APP_CLIENT_SECRET` | api | OAuth client secret. |
| `GITHUB_APP_SLUG` | api | Builds the install URL `https://github.com/apps/<slug>/installations/new`. |
| `GITHUB_WEBHOOK_SECRET` | api | The App's webhook secret; the webhook signature gate ([ADR-0024](../adr/0024-github-push-webhook-ingestion.md)). |

The worker needs only `GITHUB_APP_ID` + `GITHUB_APP_PRIVATE_KEY` (to mint installation tokens for private clones); the API needs the full set.

## Email (optional)

Unset, the API logs email payloads instead of sending them ([ADR-0011](../adr/0011-authentication-strategy.md)).

| Variable | Default | Purpose |
| --- | --- | --- |
| `RESEND_API_KEY` | *(unset → log only)* | Resend API key for transactional email. |
| `RESEND_FROM_EMAIL` | `onboarding@resend.dev` | Sender address. |
| `RESEND_FROM_NAME` | `Toopo` | Sender name. |

## Google OAuth (optional)

Set both to enable Google sign-in, then also set `NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED=true` so the web button appears.

| Variable | Default | Purpose |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | *(unset)* | Google OAuth client id. |
| `GOOGLE_CLIENT_SECRET` | *(unset)* | Google OAuth client secret. |

## Web client toggles (baked into the web image at build time)

Because `NEXT_PUBLIC_*` values are baked at build time, changing one means rebuilding the web image.

| Variable | Default | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_DEFAULT_LOCALE` | `en` | Default UI locale. |
| `NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED` | `false` | Show the Google sign-in button. |

## Postgres overlay (only with `docker-compose.postgres.yml`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | *(none — required for the overlay)* | The `db` container won't start without it. |
| `POSTGRES_USER` | `toopo` | Postgres user. |
| `POSTGRES_DB` | `toopo` | Postgres database name. |

See [Using Postgres](../guides/using-postgres.md).

> Local development uses per-app `.env` files (`apps/api/.env`, `apps/web/.env.local`) with a few dev-only variables; see each app's README. The table above is the self-host (container) surface.

---

**See also:** [Self-host with Docker Compose](../getting-started/self-host.md) · [Using Postgres](../guides/using-postgres.md) · [Troubleshooting](../guides/troubleshooting.md).
