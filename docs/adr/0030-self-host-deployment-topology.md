# ADR 0030: Self-host deployment topology — the docker-compose stack

Date: 2026-06-12

Status: Accepted

## Context

The deterministic cartography is built; the last build piece before going live
is letting a self-hoster run the whole product with one command. The pieces
already exist — three apps (`api`, `web`, `worker`), a dual-backend store
(ADR-0017), env-based GitHub-App credentials (ADR-0026) — but nothing packages
them. Containerising a pnpm + Turborepo monorepo, and wiring four processes that
must agree on URLs, a database, and a migration order, is its own decision.

Out of scope (deliberate): the real toopo.io hosting/DNS and the live GitHub
handshake (manual maintainer steps), and the GitHub-App Manifest 2-click
onboarding (a post-V1 follow-up).

## Decision

1. **Four-service compose.** `migrate` (one-shot), `api`, `worker`, `web`.
   `migrate` applies migrations and exits; `api`/`worker` gate on its success
   (never migrate on boot — ADR-0008). SQLite is the default (one named volume);
   Postgres is an overlay (`docker-compose.postgres.yml`) for heavier load.

2. **Per-app images via `turbo prune`.** `node:22-slim` (Debian, not alpine — the
   libSQL/`pg` native bindings and tree-sitter `.wasm` are friction-free on
   glibc), multi-stage: prune the app's subgraph → install from the pruned
   lockfile → `turbo build` → non-root runner. `web` ships Next's
   `output: 'standalone'`; `worker` adds native `git` (ADR-0025) and carries the
   wasm grammars. The `api` image doubles as the `migrate` one-shot.

3. **The server/browser URL split.** `web` used one origin for both the browser
   and SSR — a latent bug: under compose, `localhost:4000` resolves to the web
   container during SSR, not the API. A new server-only `INTERNAL_API_URL`
   (optional; **not** a `NEXT_PUBLIC_*` var, so it never enters the client
   bundle) names the API as seen from the server; the browser keeps the public
   origin. Unset ⇒ falls back to the public origin, so real-domain deploys
   configure nothing. `NEXT_PUBLIC_*` stay build-time args.

4. **SQLite resilience.** The api and worker are two writers on one file. The
   libSQL driver applies `journal_mode = WAL` + `busy_timeout` once, in its
   `init()` hook. SQLite stays a documented single-host, low-concurrency choice;
   heavy multi-writer load is steered to Postgres.

## Consequences

Good: `docker compose up --build` yields a working stack; the URL split fixes a
real SSR bug and works on plain localhost; fail-closed `.env` means only
`BETTER_AUTH_SECRET` is required. Costs: changing a public origin means
rebuilding `web` (F6); images carry dev dependencies (size over prune-complexity,
revisitable). Extends ADR-0017/0024/0025/0026; relies on ADR-0008 (no boot-time
migration). See `docs/self-host-deploy.md` and `docs/github-app-connect-setup.md`.
