# Engine validation on real code — 2026-06-09

**Milestone:** validate the deterministic Parse → Resolve engine on real-world
React/TS code before building persistence, Serve, or UI on top. The riskiest
open question: does the engine produce a *genuinely good* graph on real repos,
or only on unit fixtures?

**Method:** `@toopo/ingest` (`toopo-ingest <dir>`) runs the real pipeline —
deterministic discovery → `@toopo/parser` → `@toopo/resolver` with the
`@toopo/lang-react` plugins — over three targets, and emits the metrics below.
No persistence, Serve, UI, or AI. Graph output is in-memory/JSON only.

Raw metrics: [`toopo-monorepo.json`](./toopo-monorepo.json),
[`apps-web.json`](./apps-web.json), [`taxonomy.json`](./taxonomy.json).

## Targets

| Target | Files | Analyzed | Parse errors | Shape |
| --- | --- | --- | --- | --- |
| Toopo monorepo (this repo, whole tree) | 299 | 299 | 0 | `.ts`-heavy monorepo; workspace resolution |
| Toopo `apps/web` | 51 | 51 | 0 | Next.js app; `.tsx`, components/hooks |
| `shadcn-ui/taxonomy` @ `298a8857` (external, pinned) | 125 | 125 | 0 | Next 13 App Router; `@/*` aliases, no `.js` specifiers |

The external repo is a throwaway shallow clone (not committed), pinned at commit
`298a8857c7128a0d121e7f699dfd729f23b3966d`.

## Headline result

**Parsing is flawless. Resolution is not yet at the ~90% target — and the gap is
two specific, fixable causes, not a broad weakness.**

- **475/475 files parsed, 0 parse errors, 0 crashes** across all three targets.
  The `.ts`/`.tsx` grammar split works; the pinned `tree-sitter-typescript@0.23.2`
  grammar handled every file (no syntax too new). Graceful degradation never
  triggered. The graph is byte-identical across re-runs (determinism holds).
- **Import resolution (overall, external-inclusive):** Toopo 82.2%, apps/web
  86.6%, taxonomy 72.9%. But "overall" counts external-package imports (react,
  next, …) as resolved. The number that measures *graph quality* is the
  **internal** resolution rate — of imports that *should* bind to a repo symbol,
  how many do:

| Target | Internal resolved | Internal total | **Internal rate** | Overall |
| --- | --- | --- | --- | --- |
| Toopo monorepo | 257 | 532 | **48.3%** | 82.2% |
| apps/web | 56 | 101 | **55.4%** | 86.6% |
| taxonomy | 254 | 418 | **60.8%** | 72.9% |

Internal resolution is well below 90% on every target. The unresolved tail is
dominated by **two** causes — and nothing else of significance.

## Finding 1 — TS-ESM `.js` import specifiers are not mapped to `.ts` (resolver)

Toopo (and `apps/web`) use NodeNext module resolution, so every internal import
is written `import { x } from './foo.js'` while the file on disk is `./foo.ts`.
The resolver's relative/alias probe
([`module-resolution.ts`](../../packages/lang-react/src/resolve/module-resolution.ts))
tries `./foo.js`, `./foo.js.ts`, `./foo.js/index.ts`, … but never `./foo.ts`, so
the import is honestly reported `unresolved-module`.

- **151 of Toopo's 163 `unresolved-module` diagnostics** are `.js` specifiers.
- It also breaks **barrel export chains**: `packages/core/src/index.ts` does
  `export * from './constants.js'`, so the export chain dies on the same `.js`
  miss. Consequence: **all 10 `@toopo/*` workspace imports stay external** even
  though workspace detection correctly built every `{ name, entry }`
  (verified — the model is right; the chain-following is what fails).
- taxonomy uses bundler resolution (no `.js` extensions), so it does **not** hit
  this — which is exactly why its internal rate (60.8%) is higher than Toopo's
  (48.3%) despite being unfamiliar code.

**This is the single highest-leverage fix.** A small, faithful addition to the
resolver's candidate-path probe (map `.js`→`.ts`/`.tsx`, `.mjs`→`.mts`,
`.cjs`→`.cts`, per TS NodeNext semantics) would resolve the bulk of Toopo's
internal tail *and* re-enable workspace supersession. It is a `@toopo/resolver`
change — surfaced here, not made in this milestone (scope).

## Finding 2 — Symbol grain misses non-arrow value/type/wrapped exports (parser)

taxonomy's tail is different: **148 of its 164** unresolved are
`unresolved-export` (the module resolves — `@/*` alias resolution works — but the
imported *name* isn't a known symbol). All are `@/components` (102), `@/lib`
(30), `@/config` (16). Cause, confirmed by inspection:

- `export const siteConfig: SiteConfig = { … }` — a **non-function value const**;
  the parser's symbol query extracts only function declarations and
  arrow/function-expression consts, so this is never a symbol.
- `const Button = React.forwardRef<…>(…); export { Button }` — a **call-wrapped
  component** (`forwardRef`/`memo`/`styled`). The value is a `call_expression`,
  not an arrow/function, so `Button` is never extracted — even though it is the
  single most common real-world React component shape.
- `export interface ButtonProps` / `export type …` — **type-only exports**, also
  not extracted.

This is the *documented* v1 grain (ADR-0015 — top-level function-like symbols
only), but the dogfood **quantifies its real-world cost**: ~24% of taxonomy's
imports. Broadening the grain to value/`forwardRef`/`memo`/type/class exports is
the second prerequisite for a good graph on real React code. It is a parser/
`lang-react` change — surfaced, not made here.

## Minor findings

- **Extension probe gaps:** `.mjs`/`.cjs` (and `.mts`/`.cts`) are not in the
  resolver's probe list (taxonomy `@/env.mjs` × 10). Cheap to add alongside
  Finding 1.
- **Asset imports counted as unresolved:** `@/styles/*.css` (× 6) are non-source
  imports reported as `unresolved-module`. A metric-honesty refinement: classify
  known non-source specifiers separately rather than as failed resolutions.
- **Inferred ≈ 0 everywhere** (1 across all targets). The deterministic layer is
  behaving deterministically; there is no accidental heuristic leakage.

## What works well (validated on real code)

- **Parsing & degradation:** 100% parse success, 0 crashes, mixed `.ts`/`.tsx`
  handled, deterministic output.
- **Alias resolution:** taxonomy's `@/*`→`./*` resolved at the module level (only
  16 module-misses, all `.mjs`/CSS) — `get-tsconfig` extends-resolution + the
  pure alias table work end to end.
- **Workspace detection:** every `@toopo/*` package mapped to its correct
  `src/index.ts` source entry (supersession is blocked only by Finding 1's
  chain issue, not by detection).
- **React semantics:** rich and correct where symbols exist — taxonomy: 77
  components, 112 renders, 58 prop bindings; apps/web: 21 components, 111
  renders. Cross-file (resolve-pass) edges: 307 (Toopo), 471 (taxonomy).

## Verdict — is the engine ready to build on?

**Not yet — but the path is clear and short.** The engine's *foundation* is
sound: parsing, determinism, degradation, alias/workspace config, and React
extraction all hold on real code. The ~90% internal-resolution target is **not**
met (48–61%), but the entire shortfall traces to **two well-understood causes**,
both faithful additions rather than redesigns:

1. **Resolver:** map TS-ESM `.js`/`.mjs`/`.cjs` specifiers to their TS source
   (highest leverage; also fixes workspace supersession).
2. **Parser/lang-react:** broaden symbol grain to value consts,
   `forwardRef`/`memo`-wrapped components, and type/class exports.

**Recommendation:** land these two enhancements (each a small, well-scoped
change to the existing `lang-*`/resolver surface — no ADR contradiction; if the
symbol-grain expansion materially extends ADR-0015's stated grain, supersede it
with a new ADR) and re-run this same harness to confirm the ~90% target before
persistence/Serve/UI are built on the graph. The ingestion core
(`@toopo/ingest`) built for this validation is the reusable pipeline the future
worker will wrap — not throwaway.
