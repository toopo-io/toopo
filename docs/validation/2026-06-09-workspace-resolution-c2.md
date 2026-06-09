# Workspace resolution completeness — C2 — 2026-06-09

Follow-up to [C1](./2026-06-09-workspace-resolution-c1.md). C1 reclassified
bare and multi-star workspace imports; C2 closes the last gap — **subpath
imports** (`@toopo/ui/components/button`, `@toopo/db/schema`) — the precise way
(option A): by preserving the import subpath at parse time rather than working
around its loss.

The JSON snapshots in this folder now hold the **post-C2** numbers.

## What C2 did (option A — lossless parse)

The blocker was that a bare subpath import was emitted external at parse time
with the subpath stripped (`packageName()`), surviving in no edge or record.

1. **Parser preserves the subpath** (`@toopo/parser` + `@toopo/lang-react`). A
   new additive `ExternalImport` record on `ParseResult`/`GraphFragment` carries
   each bare import's `{ packageName, subpath, imported }`. The provisional
   external edge is unchanged; the record is pipeline data (no core change, no
   ADR — a parser-internal contract addition, per the brief).
2. **Resolver resolves the subpath** (`@toopo/resolver`). Workspace supersession
   is now driven by these records (not by decoding edges), so a subpath import
   resolves through ITS OWN source — the package's `exports`-map entry for that
   subpath — not the package root. `WorkspacePackage` gained an additive
   `subpathExports` ({ subpath → source file }); `entry` is now optional, so an
   entry-less subpath-only package (like `@toopo/ui`) is still resolvable.
3. **Config IO** (`@toopo/lang-react` pure + `@toopo/ingest` IO). The `exports`
   map is read in ingest and mapped (dist→src, built-ext→source-ext) to existing
   source files in lang-react. EXACT subpaths are handled; **wildcard subpaths
   (`./components/*`) are deferred honestly** — they need the full file list to
   enumerate, and no Toopo package uses them.

## Result — workspace subpath imports reclassify (deterministically)

| Metric (Toopo self-ingest) | post-C1 | **post-C2** |
| --- | --- | --- |
| Workspace imports reclassified internal | 318 | **387** |
| External `@toopo/*` import edges | 70 | **5** |
| Internal-deterministic import edges | 787 | **857** |
| Deterministic share | 52.1% | **56.5%** |
| Internal resolution rate | 98.1% | **98.3%** |

`@toopo/ui` (58 subpath imports), `@toopo/db/schema` (4), and `@toopo/vitest-config`
(3) reclassified external → internal. The new subpath edges are **deterministic**:
post-C2 internal import edges are 857 deterministic + 1 inferred + 1 ambiguous.

Per-target (no change for the two without workspace subpaths, as expected):

| Target | internal | overall | det-share |
| --- | --- | --- | --- |
| Toopo monorepo | **98.3%** | 99.0% | 56.5% |
| apps/web | 92.2% | 98.3% | 19.8% |
| taxonomy@298a8857 | 94.9% | 96.8% | 59.5% |

## Remaining tail (the documented stop point)

- **Resolution-rate tail** (Toopo: 14 unresolved + 1 ambiguous): non-source
  asset imports (`.css`/`.json`/`.mjs`) and `lang-react`'s own
  negative-test fixtures (`./Nowhere`, `./Base`, …). Near-zero real misses; the
  1 ambiguous is an honest multi-star collision.
- **Workspace external tail — 5 edges:** `@toopo/api-contracts` (4 names not on
  its public surface) and `@toopo/core` (1). Tiny residual edge cases, honestly
  left external.
- **Deferred:** wildcard subpath exports (`./components/*`) — unused by any
  target; would need ingest-side file enumeration.

## Verdict

Workspace cross-package imports — bare (C1), multi-star barrels (C1), and
subpath (C2) — now reclassify external → internal, deterministically, leaving 5
honest edge-case edges of ~860 internal. Combined with the resolution-rate gate
(internal 92–98% across all three targets), the deterministic engine produces a
genuinely connected, internally-resolved graph on real React/TS code. Stops here
on the feature branch, unmerged.
