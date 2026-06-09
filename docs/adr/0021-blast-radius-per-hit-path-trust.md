# ADR 0021: Blast-radius per-hit path trust

Date: 2026-06-10

Status: Accepted

## Context

The blast radius (ADR-0020 §4/§5) answers "who transitively depends on this
node?" by reverse-reachability over dependency edges. Each edge carries
`resolution: deterministic | inferred` (ADR-0015 §8), but reverse-reachability
collapses many paths into one hit per node, so the first cut discarded that
trust and showed a single panel-level caveat — "a path may include inferred
links" — for the whole set. That is honest but coarse: it cannot tell a
*certainly impacted* dependent (a statically proven chain reaches it) from a
*possibly impacted* one (every path depends on a heuristic guess). ADR-0015 §8
requires certain and uncertain to be distinguishable **per fact, in the data and
the UI** — not merged behind one disclaimer.

## Decision

1. **Per-hit `pathResolution`.** Every blast-radius hit carries
   `pathResolution: deterministic | inferred`. It is `deterministic` iff **some
   fully-deterministic reverse-dependency path reaches the node** (a proven chain
   exists), and `inferred` iff **every** path to it traverses ≥1 inferred edge.
   "Any proven path wins" is the right definition of certainly-impacted: one
   verifiable chain is enough to assert real impact.

2. **Depth ⟂ trust.** `depth` (shortest distance, proximity) and
   `pathResolution` (any-proven-path, trust) are **independent** aggregates over
   the same hit set. A node's shortest path may be inferred while a longer,
   fully-deterministic one exists; it is then reported `{ depth: 1,
   pathResolution: deterministic }`. Depth is never a trust claim — coupling them
   would manufacture false certainty or hide real certainty.

3. **Portable integer CTE.** The recursive blast CTE (ADR-0017 §6) carries a
   `path_det` integer: anchor `1`, each step `path_det * (case when
   resolution='deterministic' then 1 else 0 end)` — so it stays `1` only while
   every edge is deterministic. The grouped hit takes `max(path_det)` (1 iff any
   proven path reaches it). Integer multiply + `case` is used over a boolean
   `AND` because Postgres will not coerce integer→boolean; `*`/`case`/`max` are
   byte-identical on libSQL-SQLite ≥3.38 and Postgres. The integer→literal map
   lives in TS, never in SQL.

## Consequences

- The UI distinguishes certainly- from possibly-impacted dependents per node
  (solid vs dashed, the existing trust language); the panel-level caveat is
  removed, superseded by the real distinction.
- Cross-backend identity is preserved and tested, including on Toopo's own graph,
  which is genuinely mixed (certain *and* possible hits) — proving both branches
  on real code, never an assumed all-certain result.

## Alternatives considered

- **Couple depth to the proven path** — rejected (§2): it loses the nearest
  dependent or fabricates certainty.
- **Boolean `AND` in the CTE** — rejected: not portable to Postgres.
- **Keep the panel-level caveat** — rejected: violates ADR-0015 §8 (per-fact
  distinguishability).

## Related ADRs

- ADR-0015 (trust in the type, §8), ADR-0020 (Serve — blast-radius view),
  ADR-0017 (portable dual-backend SQL), ADR-0006 (Zod single source of truth).
