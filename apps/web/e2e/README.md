# Web E2E — cartography dogfood

Playwright e2e for the visual cartography (ADR-0020). It drives a real browser
against the running web app and asserts the V1 map renders over a **real,
worker-populated graph** — by default Toopo's own (the dogfood).

The web dev server is started/reused by Playwright. The **Serve API on port 4000
over a populated graph is a prerequisite** — Playwright does not own it because
it is a separate service with its own database. Stand it up once:

```bash
# From the repo root. Self-host backend = a local SQLite file (no shared infra).
export DB="file:$(pwd)/.dogfood/toopo.db"

# 1) Create + migrate the dogfood database (explicit, never on boot — ADR-0008).
DATABASE_URL="$DB" pnpm --filter @toopo/db exec tsx src/bin/migrate.ts

# 2) Populate it with Toopo's own graph via the worker CLI (ADR-0020 §6).
pnpm --filter @toopo/worker exec tsx src/cli/bin.ts ingest "$(pwd)" --database-url "$DB"

# 3) Boot the Serve API against that graph (other env from apps/api/.env).
DATABASE_URL="$DB" node --env-file=apps/api/.env apps/api/dist/main.js
```

Then run the e2e (from `apps/web`):

```bash
pnpm exec playwright install chromium   # first run only
pnpm test:e2e
```

The screenshot artifact is written to `apps/web/test-results/graph-map.png`.

> CI note: wiring steps 1–3 into a Playwright `globalSetup` (so the whole chain
> is one command) is the follow-up when the e2e moves into CI. For now the
> prerequisite is explicit and documented.
