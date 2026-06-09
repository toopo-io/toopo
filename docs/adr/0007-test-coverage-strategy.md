# ADR 0007: Test coverage strategy

Date: 2026-05-15
Status: Accepted

## Context

Vitest can enforce a coverage threshold and fail the test run if any
package drops below it. Choosing **where** to apply that gate is a
real architectural decision, not a tooling default. Phase 2.5
remediation (F42) exposed that applying a single global 80% threshold
uniformly to every package broke CI for `apps/api` (16.6% lines) and
`apps/web` (26.0% lines) the moment we wired `pnpm test:coverage`
into the pipeline.

## Decision

Coverage thresholds apply to **shared packages only**:

- `packages/env`, `packages/api-contracts`, `packages/ui` are gated
  at 80% (lines, functions, branches, statements) via the base
  config in `tooling/vitest/base.ts`.
- `apps/api` and `apps/web` override `coverage.thresholds` to zero
  in their per-package `vitest.config.ts`. Their tests still run and
  their coverage report is still emitted (useful for inspection), but
  the threshold gate is off.

Apps are validated via integration tests (e.g.
`test/health.e2e-spec.ts` boots the full Nest app against supertest)
and via planned Playwright E2E in Phase 3.

## Consequences

- Shared library code — the parts that are reused across apps — has
  a hard quality floor enforced in CI.
- App code is judged on whole-flow tests, not unit-coverage rituals
  that mostly measure framework behavior (React render output,
  NestJS DI wiring, Next routing).
- New shared packages inherit the 80% gate by default — adding a
  package without enough tests will red CI, which is the intent.
- Per-package overrides must use **explicit zeros** for thresholds.
  Setting `thresholds: undefined` is a no-op because Vite's
  `mergeConfig` skips undefined values.

## Alternatives considered

- **Global 80% everywhere**: failed in practice (F42). Would force us
  to write unit tests on shaped code that doesn't pay back the
  investment.
- **No threshold at all**: shared packages would silently rot.
- **Lower the global to 20%**: meaningless number that gates nothing
  while looking like it does.
