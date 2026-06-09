# ADR 0008: Env validation at module load

Date: 2026-05-15
Status: Accepted

## Context

Both apps validate their environment variables eagerly at module
load: `apps/api/src/env.ts` and `apps/web/env.ts` each call
`createEnvValidator(Schema)(process.env)` at the top level. The
benefit is fail-fast: a missing or invalid env var crashes boot with
a readable Zod error before any request is served or any page is
rendered.

The trade-off surfaced during Phase 2.5 remediation as F41: Next.js
evaluates page module bodies during `next build` ("Collect page
data" pass) to discover route metadata. Eager env validation means
**the build itself** requires every env var to be present, not just
runtime. CI without an `.env.local` fails the build before any test
runs.

## Decision

Keep eager env validation. Apps continue to fail fast at module
load.

CI provides build-time placeholder env vars on the `Build` step in
`.github/workflows/ci.yml`:

```yaml
- name: Build
  env:
    NEXT_PUBLIC_API_URL: http://localhost:4000
    NEXT_PUBLIC_DEFAULT_LOCALE: en
  run: pnpm build
```

These mirror `apps/web/.env.example`. Production deployments
(Vercel, Railway, Render, etc.) provide real values via their own
env config. Since both apps' health/landing pages are server-dynamic
(`ƒ` in the Next route output), no placeholder gets baked into a
client bundle.

`apps/api` does **not** need build-time env vars: `nest build` is
`swc + tsc` with no module evaluation. The `Env` singleton is only
exercised when `node dist/main.js` actually boots.

## Consequences

- Production stays safe: an env-misconfigured deployment crashes on
  startup, not on the first 500 served to a user.
- CI builds need placeholder env vars listed in
  `.github/workflows/ci.yml`. When `.env.example` adds a new var,
  the workflow must add it too.
- Build placeholders must match `.env.example` exactly. Drift is
  caught at PR review.

## Three-leg env propagation chain

Phase 4.1 surfaced a subtlety: in turbo 2.x, env vars set on a CI step
or in a developer's shell **do not** automatically reach task
subprocesses. Turbo strips arbitrary env for cache determinism unless
each task explicitly declares which vars it consumes via `env: [...]`.
The visible symptom was `apps/api:test:coverage` failing with
`DATABASE_URL: undefined` even though the CI step set the var
correctly. This was latent for 8 commits behind an earlier coverage
threshold failure (see Phase 4.1 report and the `chore(ci)` follow-up
commit).

The full propagation chain for any env var an app or test needs is:

1. **Documented** in `apps/<app>/.env.example` (the source of truth for
   contributors copying into their local `.env`).
2. **Provided in CI** as a step-level `env:` block in
   `.github/workflows/ci.yml` (`Build`, `Test (with coverage)`, etc.).
3. **Declared in turbo tasks** as `env: ["VAR_NAME"]` in `turbo.json`,
   on every task that needs it (typically `build`, `dev`, `test`,
   `test:coverage`).

A var present in (1) and (2) but missing from (3) will silently
disappear when turbo forks the task subprocess. A var in (3) but
missing from (2) will be undefined in CI and fail the eager validator
at module load. Adding a new env var means touching all three.

**Operational checklist** for adding an env var:

1. Add the key to the Zod schema in the relevant `env.schema.ts`
   (with the correct type and default policy).
2. Add the key to `.env.example` with a representative placeholder
   so fresh clones boot.
3. Add the key under `env:` in `turbo.json` for every task that
   reads it (typically `build`, `dev`, `test`, `test:coverage`).
4. If the var is required during CI build or test, add it under
   the matching job's `env:` in `.github/workflows/ci.yml`.

## Alternatives considered

- **Lazy validation at first request**: hides config errors until
  a user triggers them. Worse production posture.
- **Default values for every var**: same hiding, plus encourages
  shipping with development defaults to production.
- **Validate only "required at build" vars eagerly**: forks the
  schema in two and is hard to keep consistent.
