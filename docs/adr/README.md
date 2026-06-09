# Architecture Decision Records

Each ADR captures a single architectural decision: the context that
forced the choice, the choice itself, and the consequences (good and
bad). ADRs are immutable once accepted — if a decision changes, write
a new ADR that supersedes the old one.

## Conventions

- Filename: `NNNN-kebab-case-title.md` where `NNNN` is a zero-padded
  4-digit sequence.
- Status starts at `Proposed`, becomes `Accepted` once merged, and may
  become `Superseded by ADR-NNNN` later.
- Keep each ADR short — 200–400 words. Capture the **why**, not the
  **how** (the code shows how).
- Cross-reference with `ADR-NNNN` and link related ADRs in
  "Consequences".

## Index

| # | Title | Status |
| --- | --- | --- |
| [0001](0001-monorepo-and-tooling.md) | Monorepo and tooling baseline | Accepted |
| [0002](0002-typescript-strict-flags.md) | TypeScript strict flags | Accepted |
| [0003](0003-nestjs-cjs-versus-esm.md) | NestJS CJS vs. ESM | Accepted |
| [0004](0004-build-distributed-shared-packages.md) | Build-distributed shared packages | Accepted |
| [0005](0005-tsconfig-profile-separation.md) | TSConfig profile separation | Accepted |
| [0006](0006-zod-as-single-source-of-truth.md) | Zod as single source of truth | Accepted |
| [0007](0007-test-coverage-strategy.md) | Test coverage strategy | Accepted |
| [0008](0008-env-validation-at-module-load.md) | Env validation at module load | Accepted |
| [0009](0009-i18n-strategy.md) | i18n strategy | Accepted — partially superseded by ADR-0018 |
| [0010](0010-asset-bundling-strategy.md) | Asset bundling strategy for apps/api | Accepted |
| [0011](0011-authentication-strategy.md) | Authentication strategy | Accepted |
| [0012](0012-database-choice.md) | Database — Neon Postgres + Drizzle ORM | Superseded by ADR-0017 |
| [0013](0013-rgpd-compliance.md) | RGPD compliance approach | Accepted |
| [0014](0014-internal-route-urls-single-source-of-truth.md) | Internal route URLs — single source of truth | Accepted |
| [0015](0015-universal-code-graph-model.md) | Universal code-graph model (packages/core) | Accepted |
| [0016](0016-parsing-and-resolution-strategy.md) | Parsing and resolution strategy | Accepted |
| [0017](0017-storage-strategy.md) | Storage strategy — dual-backend persistence | Accepted |
| [0018](0018-english-only-active-locale.md) | English-only active locale; i18n machinery retained | Accepted |
| [0019](0019-licensing.md) | Licensing — AGPL-3.0-or-later | Accepted |
| [0020](0020-serve-pass-architecture.md) | Serve-pass architecture — read API, derived views, pagination | Accepted |
