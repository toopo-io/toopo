# ADR 0010: Asset bundling strategy for apps/api

Date: 2026-05-15
Status: Accepted

## Context

Phase 3 shipped i18n on `apps/api` by importing JSON catalogs at
compile time:

```ts
import en from './locales/en.json';
```

This was assumed to "bake" the catalog into the build artifact, on
the strength of `resolveJsonModule: true` in the tsconfig and the
ADR-0003 addendum that pointed to it. **It does not.** The API
crashed at boot with `Cannot find module './locales/en.json'`
because the compiled output preserves the require call verbatim and
the JSON file is never copied to `dist/`.

The root misconception worth capturing once: **neither `tsc` nor
`swc` is a bundler.** `resolveJsonModule` is a type-resolution flag —
it lets TypeScript see the JSON's shape during compilation. It does
not inline the bytes. The same `require('./locales/en.json')`
appears in `tsc`-emitted output as in `swc`-emitted output. A
bundler (esbuild, tsup, webpack, Turbopack, Vite) is what inlines
JSON; the NestJS toolchain does not include one.

`apps/api` also can't lean on `nest-cli.json`'s `compilerOptions.
assets` block — the swc builder ignores it (ADR-0003).

## Decision

`apps/api` ships non-TS data in **two** distinct categories, each
with its own loading rule:

### 1. "Code-shaped data" → `.ts` modules

Translation catalogs, configuration constants, enum tables, lookup
maps — anything whose schema is known at compile time and whose
content is small enough to live in the bundle.

These are authored as `.ts` files that export typed `as const`
objects:

```ts
// apps/api/src/i18n/locales/en.ts
export const en = { errors: { … } } as const satisfies LocaleCatalog;
```

Both `swc` and `tsc` handle `.ts` imports natively — the export is
inlined into the compiled `.js`, no filesystem dependency at
runtime. Type-safety is stronger than with JSON because the literal
type drives downstream declaration merging (e.g. i18next's
`CustomTypeOptions`).

### 2. "Tool-consumed files" → outside `src/`, loaded by the tool

SQL migrations, email templates, HTML fragments — anything that a
specific tool (Drizzle, an email renderer) reads from disk at its
own conventional path.

These live **outside** `src/` (typically a sibling directory like
`apps/api/drizzle/` or `apps/api/templates/`) so that `nest build`
never tries to compile them and the tool finds them at its own
convention. The path is resolved relative to the project root or
via an explicit env-var, never relative to `__dirname`.

## Asymmetry with apps/web

`apps/web` (Next.js 16) keeps locale JSON files because Next's
bundler (webpack / Turbopack) inlines JSON natively. The asymmetry
reflects a structural reality: **the web app has a bundler in its
toolchain, the API does not.** Future contributors should treat
"`.json` is fine on web, `.ts` is required on api" as a feature of
that structural difference, not as an inconsistency to fix.

## Pattern for Phase 4+

When introducing new asset types, the first question is "does the
runtime read this file by path, or does the application import it as
data?":

- **Import as data** → category 1: author it as `.ts`. Add no
  build-pipeline machinery.
- **Read by path** → category 2: place it outside `src/` and load
  it via the owning tool's convention. Document the path in the
  module's README so the next contributor doesn't have to grep
  build configs.

Avoid post-build copy scripts. They are correct on a static
filesystem but fragile across `nest start --watch`, Turborepo
caching, Docker builds, and cross-OS paths. The asset categories
above sidestep that fragility entirely.

## Operational gap (not closed by this ADR)

This bug shipped because the CI gauntlet — typecheck, lint, test,
build — does not actually boot the application. A future CI
improvement should add a "smoke boot" step: start the API, hit
`GET /v1/health`, assert 200, kill it. Out of scope for Phase 3.5,
but recorded here so the gap is visible to whoever picks up
deployment hardening.

## Lesson

Don't assume `tsc` or `swc` inline JSON. They are transpilers, not
bundlers. Verify build behavior by inspecting compiled output, not
by trusting TypeScript config flag names (`resolveJsonModule`
sounds like "module bundling for JSON" — it isn't).

## Worked example — the dist/src/ prefix and Z1

Phase 3.5 also surfaced a second, sibling symptom: `dist/main.js`
didn't exist; the entry was at `dist/src/main.js`. Two further
crashes followed from the same misplacement: `node dist/main.js`
(the `start` script) and `require('../../../package.json')` in
`health.service.ts` (the version lookup), both because the
compiled file sat one directory deeper than the source-relative
path math anticipated.

The shallow fix would have been three independent patches — edit
the start script, convert `package.json` reads to a `.ts` version
constant, ship. The investigation went deeper: all three crashes
shared one root cause — the nest CLI's swc-builder was invoking
swc with the project root as CWD, so swc's directory walker
preserved the leading `src/` in every output path.

The architectural fix turned out to be one config field:

```json
"compilerOptions": {
  "builder": {
    "type": "swc",
    "options": {
      "outDir": "dist",
      "filenames": ["src"],
      "stripLeadingPaths": true
    }
  },
  "typeCheck": true
}
```

`stripLeadingPaths` is an `@swc/cli` flag that strips the input
directory's prefix from emitted paths. The nest swc-builder spreads
`builder.options` into the swc CLI options, so the flag passes
through. Result: `dist/main.js`, `dist/modules/health/`, etc. —
the layout that source-relative paths and the existing start
script were already written against.

### Why earlier config attempts didn't reveal this

- `tsConfigPath` in top-level `compilerOptions` is silently
  ignored by the swc builder. It applies to `projects.*` in
  **monorepo** mode and to the `tsc` builder (as `configPath`,
  no `tsConfig` prefix). The build pipeline never used
  `tsconfig.build.json`.
- `rootDir` in `tsconfig.build.json` is irrelevant to swc emit
  paths. swc-cli walks directories; tsc's rootDir concept does
  not apply.

### Phase 2 audit (F31) — completed, not redone

The F31 commit (`f01072e`) split `tsconfig.json` (typecheck:
`rootDir: "."`, includes src + test) from `tsconfig.build.json`
(build: `rootDir: "src"`, excludes test). The commit message
called this a no-op; in fact `tsconfig.build.json` was dead
config — the swc builder never read it. Phase 3.5 doesn't undo
F31; it leaves the split in place (typecheck still uses
`tsconfig.json`, which correctly includes test/ for e2e specs)
and adds the swc-builder config that actually shapes emit paths.

### Operational gap (still open)

Spec files (`*.spec.ts`) under `src/` are still compiled into
`dist/` because tsconfig.build.json's `exclude` block is not
honored by the swc builder either. They are unused at runtime
(nothing imports them) — cosmetic, not a correctness issue.
A future polish could add `ignore: ["**/*.spec.ts",
"**/*.e2e-spec.ts"]` to `builder.options`. Deferred.

The deeper CI gap — that none of typecheck/lint/test/build
actually boots the compiled API — is the operational gap
recorded above. Phase 3.5 surfaced *three* runtime-only bugs
(i18n JSON imports, start script path, version require)
through one manual boot. A "smoke boot" step in CI would have
caught all three.

## Consequences

- A clear rule for every future "I need to ship a non-TS file with
  the API" decision.
- The misleading ADR-0003 addendum is replaced by a single-line
  pointer to this ADR.
- ADR-0009 (i18n) is updated to reflect the `.ts` catalog approach;
  Phase 3's "Option A as `.json` import" is recorded as a known-
  broken path, kept in the alternatives list to prevent regression.
- Adding a third locale is now: copy `en.ts` → `<code>.ts`, type it
  against `CatalogShape<ApiCatalog>`, translate strings. No JSON,
  no copy script.

## Alternatives considered

- **Post-build copy script (`cpx`, `shx`, `nest-cli` assets shim)**
  — works for the symptom but introduces a moving part to every
  future asset decision. Rejected in favor of the category 1/2
  split that removes the need for copying.
- **Switch to `tsc` from `swc`** — would not help. `tsc` doesn't
  inline JSON either. The runtime symptom is the same.
- **Bundle the API with `esbuild` / `tsup`** — solves the asset
  problem and several others, but reopens ADR-0003's CJS interop
  surface. Worth revisiting when there's a second reason to
  bundle; not on the strength of i18n alone.
- **`i18next-fs-backend`** — async init, runtime fs reads, and we'd
  still need the JSON copied to `dist/`. Rejected in ADR-0009 for
  these reasons; Phase 3.5 confirms the rejection.

## Related ADRs

- ADR-0003 (NestJS CJS vs. ESM) — defines the build toolchain
  constraint that makes this ADR necessary.
- ADR-0009 (i18n strategy) — first concrete application of
  category 1.
