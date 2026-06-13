# Verification gates

> This is a thin outline. The canonical, enforced definition lives in `CLAUDE.md` and is run by lefthook (pre-commit / pre-push) and CI.

A change is "done" only when **all six** gates pass — not when the code is written.

| # | Gate | Command |
| --- | --- | --- |
| 1 | TypeScript strict typecheck — clean | `pnpm typecheck` |
| 2 | Biome lint + format — clean | `pnpm lint` |
| 3 | Vitest — green, ≥80% coverage on new code | `pnpm test` |
| 4 | Build — green across the affected graph | `pnpm build` |
| 5 | Dependency-boundary check — one-way, no runtime cycles, `core` dependency-light | `pnpm boundaries` |
| 6 | Conventional Commit message | enforced by commitlint on commit |

Gate 5 runs dependency-cruiser for the directional rules (apps and tooling are leaves; no `packages`/`tooling` → `apps`; no runtime cycles; `core` imports no other workspace package; the web app reaches only the contract/presentation packages) plus a manifest check that `core` has zero runtime dependencies.

Enforcement is automated: lefthook runs these locally on commit and push, and CI runs them on every push.

---

**See also:** [Development setup](development-setup.md) · [Architecture overview](../architecture/overview.md).
