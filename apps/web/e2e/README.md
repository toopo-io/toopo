# Web E2E — gated cartography (full stack, self-contained)

Playwright e2e for the project-scoped, **authenticated** cartography (ADR-0020 +
ADR-0022). It is the positive-path complement to the 401 negative-path e2e in
`apps/api` (`test/graph.e2e-spec.ts`): together they prove Fork 5 is closed —
the graph is unreachable without a session, and reachable, project-scoped, with
one.

Unlike a thin UI test, this harness **owns the whole stack** — no manual
prerequisites. From `apps/web`:

```bash
pnpm exec playwright install chromium   # first run only
pnpm test:e2e
```

`playwright.config.ts` then:

1. **`webServer` (API)** — `e2e/full-stack/start-api.mjs` wipes + migrates a
   fresh ephemeral SQLite database (ADR-0008), worker-ingests the monorepo under
   a project (resolve-or-create, ADR-0022), then starts the Nest API. The seed
   runs in the server bootstrap because Playwright starts `webServer`s *before*
   `globalSetup`, and the API connects to the database eagerly at boot.
2. **`webServer` (web)** — `e2e/full-stack/start-web.mjs` builds and serves the
   **production** Next app (no Turbopack-dev flakiness; HMR-free client fetches),
   with `NEXT_PUBLIC_*` baked to point at the e2e API.
3. **`setup` project** (`auth.setup.ts`) — signs a viewer up, verifies them
   out-of-band, signs in for a real Better Auth session cookie, asserts the
   authenticated project list returns the seeded project, and persists the
   browser `storageState`.
4. **`chromium` project** (`projects-graph.spec.ts`) — with that session,
   browses the gated picker and opens the project-scoped graph, asserting the
   cartography renders (nodes/edges/trust) and capturing the review artifacts
   `test-results/projects-picker.png` and `test-results/project-graph.png`.

One ephemeral SQLite file (under the OS temp dir) backs it all; **ports 3000 and
4000 must be free**.

> **Follow-up:** the blast-radius panel flow (open a symbol → toggle the overlay
> → per-hit certain/possible trust, ADR-0021) is covered by unit tests
> (`node-detail-panel.test.tsx`, the `blast` suite) and the `apps/api`
> blast-radius e2e; adding its gated-UI screenshot to this harness (drill to a
> symbol, open the panel) is a clean next step on this backbone.
