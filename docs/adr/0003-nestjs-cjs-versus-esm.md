# ADR 0003: NestJS CJS vs. ESM

Date: 2026-05-15
Status: Accepted

## Context

The rest of the repo is ESM-first: shared packages emit ESM, Next.js
runs ESM natively, Vitest runs ESM. NestJS 11 nominally supports ESM,
but the combination of `reflect-metadata`, `tsyringe`-style DI,
decorator metadata, and the third-party ecosystem (`nestjs-pino`,
`nestjs-zod`, `@nestjs/swagger`) is materially smoother on CommonJS.

## Decision

`apps/api` stays on **CommonJS**:

- `package.json` omits `"type": "module"` (defaults to CJS).
- `tsconfig.json` extends `@toopo/tsconfig/node-classic.json` which
  sets `module: "commonjs"` and `moduleResolution: "node10"`.
- `verbatimModuleSyntax` is explicitly **off** so the swc-emitted
  output can interop with both `require()`-style libraries and the
  dynamic `import()` we use for `@fastify/helmet`.
- SWC is the compiler (`.swcrc` enables `legacyDecorator` and
  `decoratorMetadata`), `tsc` is type-check-only.

Everything else (`apps/web`, every `packages/*`, every `tooling/*`)
remains ESM.

## Consequences

- `apps/api` can `require('./package.json')` synchronously for the
  health endpoint version lookup without ESM JSON-import gymnastics.
- `import('@fastify/helmet')` is the supported `await` pattern for
  CJS-to-ESM interop — used in `main.ts`.
- One mental-model split in the repo. Worth it: stable runtime for
  the API > theoretical purity.

## Alternatives considered

- **Full ESM for NestJS**: tried in the spike — broke
  `@nestjs/swagger` metadata emission and required `--experimental-vm`
  flags. Not worth the friction.
- **Bundle the API with esbuild / tsup**: solves some of the interop
  pain but loses Nest's CLI ergonomics (`nest start`, `nest build`).

## Phase 3 addendum — Biome parameter-decorator opt-in

NestJS' request-mapping idioms rely heavily on **parameter decorators**
(`@Body()`, `@Param()`, `@Query()`, `@Req()`). Biome's parser rejects
parameter decorators by default — they are a long-debated TS-experimental
feature. When `apps/api` introduced `POST /v1/polling/preview` in Phase 3,
the first method with a `@Body() dto` parameter, Biome's `check` failed
with a parse error.

Resolution: the existing `apps/api/**/*.ts` override block in
`tooling/biome/biome.json` gained
`javascript.parser.unsafeParameterDecoratorsEnabled: true`. The flag is
scoped — `packages/*` and `apps/web` keep the stricter default. This
constraint travels with the NestJS choice; if we ever migrate `apps/api`
away from NestJS, this override should be removed alongside.

The swc builder also does **not** honor `compilerOptions.assets`
in `nest-cli.json` for non-`.ts` files. How `apps/api` ships non-TS
data given that constraint is its own decision — see
[ADR-0010](0010-asset-bundling-strategy.md). (Earlier text in this
addendum claimed `resolveJsonModule` solved the asset-copy gap; it
doesn't — neither `tsc` nor `swc` inline JSON. Phase 3.5 corrected
the approach.)
