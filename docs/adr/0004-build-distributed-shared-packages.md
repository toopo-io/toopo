# ADR 0004: Build-distributed shared packages

Date: 2026-05-15
Status: Accepted

## Context

`apps/api` (NestJS, CommonJS — see [ADR-0003](0003-nestjs-cjs-versus-esm.md))
runs under plain Node and cannot import `.ts` source directly.
`apps/web` (Next.js) and Vitest can, but they share dependencies with
the API. Sharing raw TS source per consumer broke at runtime in Phase 2
with `ERR_PACKAGE_PATH_NOT_EXPORTED` errors when the API tried to
import packages whose `exports` map pointed at `.ts` files.

## Decision

Every `packages/*` is **build-distributed**: a `tsc` build step emits
`.js` + `.d.ts` into `dist/`, and `package.json` `exports` point at
those compiled artifacts. Source `.ts` files are also shipped in the
`files: ["src", "dist"]` array so editors can jump to source for
debugging, but no consumer ever imports them at runtime.

Internal relative imports in package source use `.js` extensions
(e.g. `import { cn } from '../lib/utils.js'`). TypeScript's Bundler
resolution maps `.js` → `.ts` at compile time; Node ESM loads the
real `.js` artifact at runtime.

## Consequences

- API consumers get a published, runnable artifact — no source
  resolution surprises.
- Turbo task graph requires `typecheck` to depend on `^build` (not
  `^typecheck`). Reason: each package's `"types"` field points at
  `dist/index.d.ts`. Without a prior build, downstream typecheck
  cannot resolve `@toopo/*` types. We attempted the inverse during
  Phase 2.5 remediation (F25) and it broke type resolution
  end-to-end. The constraint is captured here so future contributors
  understand why turbo's `typecheck` deps look "heavier" than the
  task name suggests.
- Build adds ~5 seconds to a cold workspace install; Turbo caches it
  thereafter.
- Future optimization (TS project references + `tsc -b`, or a
  types-only build task) requires architectural change beyond the
  scope of incremental cleanups.

## Alternatives considered

- **Point `"types"` at source `.ts`**: works for ESM consumers, but
  reopens the `apps/api` CJS resolution problem ADR-0003 spent
  budget closing.
- **Turbo `^typecheck` only**: faster cold typecheck on paper, broken
  in practice — see Consequences.
