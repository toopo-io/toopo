# Engine validation on real code — post-fix re-run — 2026-06-09

Follow-up to [the baseline report](./2026-06-09-engine-on-real-code.md), after
landing the two fixes that baseline recommended:

- **Fix A** — map TS-ESM `.js`/`.mjs`/`.cjs` import specifiers to their TS
  source (`@toopo/lang-react` resolver).
- **Fix B** — broaden the parser symbol grain to value consts, `forwardRef`/
  `memo` components, type/interface, and class declarations (+ `extends`/
  `implements` edges).

Same harness (`toopo-ingest`), same three targets. Raw post-fix metrics:
[`toopo-monorepo.json`](./toopo-monorepo.json), [`apps-web.json`](./apps-web.json),
[`taxonomy.json`](./taxonomy.json).

## Result — the ~90% internal-resolution gate is met on every target

Parsing remains flawless (all files analyzed, 0 parse errors, 0 crashes,
deterministic). Import resolution improved decisively. The meaningful number is
the **internal** rate — of imports that should bind to a repo symbol, how many do
(`resolved-internal / (resolved-internal + unresolved + ambiguous)`):

| Target | Internal **before** | Internal **after** | Overall before→after | Unresolved before→after |
| --- | --- | --- | --- | --- |
| Toopo monorepo | 48.3% | **97.3%** | 82.2% → 99.1% | 275 → 14 |
| apps/web | 55.4% | **92.2%** | 86.6% → 98.3% | 45 → 5 |
| taxonomy @298a8857 | 60.8% | **94.3%** | 72.9% → 96.4% | 164 → 18 |

Reported separately, never blended (metrics ruling): the **overall** rate
(external-inclusive) and the **deterministic share** — Toopo 33.4%, apps/web
19.8%, taxonomy 59.2% (the deterministic share is lower where a target leans on
many third-party packages, which resolve as external, not internal-deterministic).

### Fix A — direct effect

`unresolved-module` diagnostics on Toopo dropped **163 → 12**: every NodeNext
`import './x.js'` now resolves to `./x.ts`. Relative, alias, and barrel
re-export specifiers all benefit (one candidate-path change).

### Fix B — direct effect

The grain now populates the kinds real code exports, so imports of them resolve.
New symbol counts (previously zero):

| Target | ts:variable | ts:interface | ts:type | ts:class | react:component |
| --- | --- | --- | --- | --- | --- |
| Toopo | 233 | 108 | 71 | 23 | 55 |
| taxonomy | 96 | 52 | 21 | 1 | 77 → **176** |

taxonomy's component count more than doubled (77 → 176) — `forwardRef`/`memo`
components are now recognized — and its prop bindings rose 58 → 77. Toopo emits
its first `extends` (2) and `implements` (4) edges.

## The remaining tail is almost entirely non-source assets, not misses

- **Toopo (14):** `.json` and `.css` imports (`./messages/en.json`,
  `./globals.css`) — non-TS assets the engine correctly does not resolve as TS —
  plus a handful of `lang-react` test fixtures that are *intentionally*
  unresolvable (`./Nowhere`, `./Base`, `@/Button` — fixtures for the resolver's
  own negative tests). Genuine false-negatives in production code: ~0.
- **taxonomy (18):** `.css` assets (`@/styles/*.css`), `@/env.mjs` (a real
  `.mjs` file, outside the `.ts`/`.tsx` slice), and **2** genuine
  `unresolved-export` edge cases.

A small metric-honesty refinement would push the rate higher still: classify
known non-source specifiers (`.css`/`.json`/`.mjs`) as *non-source* rather than
*unresolved*. Minor; deferred.

## Remaining lever — workspace reclassification (does NOT gate the engine)

Bare `@toopo/*` imports are re-resolved to internal symbols by the workspace
supersession pass. This now works **partially**: 36 import edges reclassified
external → internal. 352 remain external, dominated by:

- **`@toopo/core` (166)** — its barrel uses 17 `export *` (multi-star). The
  resolver treats ≥2 stars as `ambiguous` for any single name (the honest "never
  pick one of equals" rule), so it cannot pick the source without probing each
  star. `@toopo/i18n` (19) and `@toopo/env` (4) are the same shape.
- **`@toopo/ui` (58)** — a subpath-export package (`@toopo/ui/components/*`,
  no single `src/index.ts`); workspace subpath resolution is not yet modelled.

This is a **graph-quality refinement, not a resolution-rate gate**: those imports
already count as resolved (external), so they do not lower the internal rate. Two
follow-up levers, each a faithful enhancement (surfaced, not taken here, as they
exceed Fix A/B scope):

1. **Multi-star barrel disambiguation** — probe each `export *` target for the
   name; resolve when exactly one exports it (what TypeScript itself does).
   Would reclassify the `@toopo/core`/`i18n`/`env` tail.
2. **Workspace subpath exports** — resolve `@toopo/ui/components/x` against the
   package's `exports` map. Would reclassify `@toopo/ui`.

## Verdict — ready to carry persistence / Serve / UI

The engine **meets the gate**: internal import resolution is 92–97% across a
monorepo, an in-repo Next app, and an unfamiliar external app — above the ~90%
target — with parsing at 100% and determinism intact. The remaining unresolved
tail is dominated by non-source assets and test fixtures, not real misses.

Workspace reclassification is partial and its dominant cause (multi-star
barrels) is understood; closing it is a quality refinement that does not block
building on the graph. **Recommendation: proceed to persistence/Serve/UI;**
schedule multi-star disambiguation and workspace-subpath resolution as
follow-ups, then re-run this harness to confirm the reclassification gain.
