# ADR 0001: Monorepo and tooling baseline

Date: 2026-05-15
Status: Accepted

## Context

TOOPO ships both a web client and an API plus shared schemas, UI
primitives, env validators, and design tokens. We needed a layout that
lets shared code stay in lockstep with its consumers without
publishing to a registry, and a toolchain fast enough to keep
iteration short.

## Decision

- **Turborepo 2** for the task graph and caching (`pnpm build`,
  `pnpm test`, etc. all run through `turbo`).
- **pnpm 11** as the package manager (workspace protocol for internal
  links, hoist control via `pnpm-workspace.yaml`, fastest install).
- **Biome 2** as the single lint + format tool for the whole tree —
  one config, one binary, no Prettier/ESLint coordination.
- **Vitest 4** for unit and E2E tests across every package (v8
  coverage).
- **Lefthook 2** for pre-commit (biome staged-file check) and
  pre-push (typecheck, build, test) hooks.
- **Commitlint 21** enforcing Conventional Commits on `commit-msg`.

## Consequences

- One install, one lockfile, one cache. CI is short.
- Cross-package refactors are atomic — no version drift.
- Single linter means contributors learn one tool, not two.
- Coupling cost: a bad upstream change can red the whole tree until
  fixed. We accept this as a feature, not a bug.

## Alternatives considered

- **Nx**: more features (code-gen, micro-frontends) but heavier and
  more opinionated than we need today.
- **npm workspaces**: simpler but slower install and no native
  hoisting controls.
- **ESLint + Prettier**: well-trodden but two binaries, two configs,
  two caches.
