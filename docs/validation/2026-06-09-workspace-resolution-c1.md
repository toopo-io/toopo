# Workspace resolution completeness — C1 — 2026-06-09

Follow-up to the [post-fix report](./2026-06-09-engine-on-real-code-postfix.md).
That report cleared the resolution-rate gate but left **workspace
reclassification** partial (`@toopo/*` bare imports staying external). This round
closes the dominant part of that gap.

The JSON snapshots in this folder now hold the **post-C1** numbers.

## What C1 did

1. **Multi-`export *` disambiguation** (`@toopo/resolver` + `@toopo/lang-react`).
   A name reaching ≥2 `export *` barrels was blanket-marked ambiguous. The
   resolver now probes each star target for the name (the TypeScript rule):
   exactly one provider → deterministic (proven), ≥2 → ambiguous, none → tail.
   This unblocked `@toopo/core` (17 stars), `i18n` (4), `env` (2).
2. **Export-grain completion** (`@toopo/lang-react`). Fix B extracted value
   consts, classes, interfaces, and type aliases as symbols, but the export
   extractor still only registered function/class/lexical declarations — so
   `export type { … }` / `export interface X` produced a symbol with no
   local-export record. Registering every single-name declaration uniformly
   unblocked the `export type { … }` re-exports of `@toopo/parser`/`resolver`.

## Result — workspace imports reclassify external → internal (deterministic)

| Metric (Toopo self-ingest) | post-A+B | **post-C1** |
| --- | --- | --- |
| Workspace imports reclassified internal (`resolve/workspace`) | 36 | **318** |
| External `@toopo/*` import edges | 352 | **70** |
| Internal-deterministic import edges | 503 | **787** |
| Deterministic share | 33.4% | **52.1%** |
| Internal resolution rate | 97.3% | **98.1%** |

The reclassified workspace edges are **deterministic, not inferred**: post-C1
the internal import edges are 787 deterministic + 1 inferred (+1 ambiguous, an
honest multi-star collision). The internal split is overwhelmingly proven, as
intended.

Per-target internal resolution (overall in parentheses):

| Target | post-A+B | **post-C1** |
| --- | --- | --- |
| Toopo monorepo | 97.3% (99.1%) | **98.1% (99.0%)** |
| apps/web | 92.2% (98.3%) | 92.2% (98.3%) — no workspace/multi-star, unchanged |
| taxonomy@298a8857 | 94.3% (96.4%) | **94.9% (96.8%)** |

## Remaining tail

- **Resolution rate tail** (unchanged, near-zero real misses): non-source asset
  imports (`.css`/`.json`/`.mjs`) and `lang-react`'s own negative-test fixtures.
- **Workspace reclassification tail — 70 external `@toopo/*` edges:** dominated
  by **subpath imports** — `@toopo/ui/components/*` (58) and `@toopo/db/schema`
  (4) — which is the C2 scope. The small remainder is `@toopo/api-contracts` (4
  names not on its public surface), `@toopo/vitest-config` (3, an entry-less
  tooling package, legitimately external), and `@toopo/core` (1).

## C2 (subpath exports) — stopped to surface an interface fork

C2 — resolving `@toopo/ui/components/button` via the package's `exports` map —
hits a parse→resolve boundary. A **bare** subpath import is classified and
emitted as an external edge at PARSE time, where `packageName()` strips the
subpath (`@toopo/ui/components/button` → `@toopo/ui`) and the external symbol id
encodes only the package coordinate + binding name. **The subpath is discarded
and survives in no edge or record.** Honoring it (the subpath→source-file
mapping C2 describes) therefore needs the subpath preserved across the boundary
— a `@toopo/parser` / ParseResult (or core identity) interface change, which the
brief says to surface rather than take. The decision and options are in the
hand-off; this round stops here, on the branch, unmerged.
