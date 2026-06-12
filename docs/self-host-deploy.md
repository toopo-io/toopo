# Self-host Toopo with Docker Compose

One command brings up the whole deterministic-cartography product — the web UI,
the API, the ingest worker, and a database — on your own machine or server. This
guide covers the quickstart, the one secret you must set, the SQLite-default /
Postgres-option choice, and the URL rules that trip people up. It is the
deployment counterpart to [ADR-0030](adr/0030-self-host-deployment-topology.md).

> The optional **connect-a-repo** GitHub-App layer has its own guide:
> [github-app-connect-setup.md](github-app-connect-setup.md). The stack runs
> fully without it.

## Prerequisites

- Docker with the Compose plugin (`docker compose version`).
- That's it — every language runtime, `git`, and the database are inside the
  images.

## Quickstart

```bash
cp .env.example .env
# Set the one required secret:
#   openssl rand -base64 32   →  paste into BETTER_AUTH_SECRET in .env
docker compose up --build
```

Then open <http://localhost:3000>, sign up, and you're in. The first
`docker compose up` builds the three images (a few minutes), runs migrations
once, then starts the API, the worker, and the web app.

Services and ports:

| Service | Role | Port |
| --- | --- | --- |
| `web` | Next.js UI | <http://localhost:3000> |
| `api` | NestJS read API + auth + webhooks | <http://localhost:4000> |
| `worker` | queue drainer (clone → ingest → graph) | — |
| `migrate` | one-shot schema apply, then exits | — |

Health: the API exposes `GET /v1/health`; the web app waits for it before
starting (`docker compose ps` shows `healthy`).

## The one required value

`BETTER_AUTH_SECRET` — the API refuses to boot without it (min 32 chars).
Generate one with `openssl rand -base64 32`. Everything else in `.env.example`
has a working local default, and every integration is **fail-closed**: blank
means "disabled", never "broken".

## Database: SQLite (default) or Postgres

**SQLite (default).** `DATABASE_URL=file:/data/toopo.db`, stored in the
`toopo-data` volume. Zero extra setup. This is a **single-host, low-concurrency**
choice: the API and worker share one file, with WAL + a busy timeout to absorb
the two-writer contention (ADR-0030 §4). Right for a personal or small-team
instance.

**Postgres (option).** For heavier or multi-writer load, run with the overlay:

```bash
docker compose -f docker-compose.yml -f docker-compose.postgres.yml up --build
```

It adds a `postgres:16` service and repoints the stack at it
(`postgres://toopo:toopo@db:5432/toopo` by default — change the `POSTGRES_*`
values in `.env` for anything exposed). The SQLite volume is simply unused.

## Deploying to a real URL

Two rules, both about URLs (the classic self-host foot-guns):

1. **Set the origins and rebuild web.** `WEB_ORIGIN` and `API_ORIGIN` drive
   every other URL (auth base, CORS, the web client's API URL). For a remote
   deploy set them to your real URLs, e.g.:

   ```bash
   WEB_ORIGIN=https://toopo.example.com
   API_ORIGIN=https://api.toopo.example.com
   ```

   The web client bakes `NEXT_PUBLIC_*` **at build time**, so after changing
   `API_ORIGIN` you must rebuild: `docker compose up --build web` (ADR-0030 §3).

2. **Leave `INTERNAL_API_URL` alone.** The web container reaches the API over
   the compose network at `http://api:4000` (wired in `docker-compose.yml`),
   which is why server-side rendering works even though the browser uses the
   public origin. You only override it if you split web and API onto different
   hosts.

Put a TLS-terminating reverse proxy (Caddy, Traefik, nginx) in front for HTTPS;
point it at the published `:3000` and `:4000`. The actual toopo.io
hosting/DNS is out of scope here (ADR-0030).

## Operations

- **Logs:** `docker compose logs -f api worker`.
- **Apply new migrations** (after pulling a new version): they run automatically
  on the next `docker compose up` via the `migrate` one-shot.
- **Stop / reset:** `docker compose down` keeps your data; `docker compose down
  -v` deletes the volume (irreversible).
- **Back up SQLite:** copy the `toopo-data` volume (e.g.
  `docker run --rm -v toopo_toopo-data:/data -v "$PWD":/backup busybox tar czf
  /backup/toopo-data.tgz /data`).

## Related

- [ADR-0030](adr/0030-self-host-deployment-topology.md) — the topology and the
  decisions behind it.
- [ADR-0017](adr/0017-storage-strategy.md) — the dual-backend store.
- [github-app-connect-setup.md](github-app-connect-setup.md) — the optional
  connect-a-repo flow.
