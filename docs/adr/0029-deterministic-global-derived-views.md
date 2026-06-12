# ADR 0029: Deterministic global derived views — collisions, unused, cycles

Date: 2026-06-12

Status: Accepted

## Context

The cartography promises three project-global readings of the graph:
name collisions (D5), unused symbols (D6) and recursive cycles (D7). They
are the first views that summarise the **whole** graph rather than a
neighbourhood, and the first to consume the unresolved tail ADR-0016 C11
persisted. They are **deterministic only** — no AI; the calibrated layer
is a later product, out of scope here.

Trust is the architectural heart: these views must be **incapable of
lying**. One false positive destroys the product's credibility, so the
rule throughout is *prefer missing a real issue over crying a false one*
(CLAUDE.md trust principle, ADR-0015 §8). Certain and uncertain must be
distinguishable in the data and the UI — the trust-inversion locked for
the explorer (certain = neutral/recessive; the **accent is reserved for
uncertainty**, never for importance).

This ADR extends ADR-0020 (Serve) and ADR-0016 (the tail it consumes);
it leaves ADR-0015 untouched (no new node/edge, no fabricated edge).

## Decision

1. **One usage edge-set, reused not redefined.** "Incoming usage" for
   both D6 and D7 is `DEFAULT_BLAST_RADIUS_KINDS` —
   `{imports, references, calls, extends, implements}` — everything
   except `contains`/`exports` (pure structure / a symbol's own
   declaration, never a dependency). `renders` is **not** an edge kind:
   it is the `react:renders` sub-kind of a `calls` edge, so it is
   already covered. The narrower literal set `{calls, references}` is
   **rejected**: it would assert a class that is only `extends`-ed, an
   interface only `implements`-ed, or a symbol only `imports`-ed to be
   *certain-unused* — the forbidden false-positive direction. The cost
   (a symbol imported-but-never-called is not flagged) is the acceptable
   error and a later "unused import" view's job.

2. **Top-level scope.** All three views range over **top-level
   declarations** — `kind = 'symbol'` with a `contains` edge from the
   symbol's own `file_id` (`file_id` is the containing *file* for every
   descendant, so it cannot distinguish depth; the contains-from-file
   edge does). This naturally excludes params, props, locals (ADR-0027)
   and call-sites. Project-wide local/param name collisions are noise
   that would bury the actionable signal; a variable-level filter stays
   additive for later. Not built now.

3. **D5 — name collisions, all-certain.** Top-level symbols grouped by
   `name`; a collision is a name shared by ≥ 2 such symbols. A symbol's
   *existence* is a parse fact — there is no inferred symbol — so D5 has
   **no uncertainty axis**: every collision is certain, rendered neutral,
   **no accent**. Ordered `(name, id)` for stable grouping and
   byte-identical output.

4. **D6 — unused symbols, the honesty rule.** A top-level symbol `S` is
   **certain-unused** iff all hold: (a) zero incoming usage edges (§1);
   (b) no `unresolved-member` with `target_file_id = file(S)` **and**
   `name = S.name`; (c) no `unbound-callee` with `name = S.name`
   (`file(S) = S.file_id`). Otherwise `S` is a **candidate**
   (possibly-used), never asserted unused — anchored gaps exonerate
   precisely, anchorless ones broaden by name alone. Candidate = the
   accent; certain-unused = neutral (the accent flags uncertainty, not
   importance). Conditions (b)/(c) are the ADR-0016 code-family seam,
   built now (§7).

   - **The label is "no usage detected in this graph + tail," never
     "dead."** D6 also surfaces the **exported/non-exported fact** per
     symbol (a graph fact from the `exports` edge) so the reader
     distinguishes public-API-with-no-internal-usage from likely-dead
     themselves. We display facts; we never assert "dead" or "API."
   - **The bare-identifier residual is disclosed.** A symbol used solely
     via an unresolved bare `foo()` call (a local/global, not a `.member`
     access) is outside the tail (ADR-0016): D6 states this blind spot in
     the UI rather than imply omniscience. "Certain" is scoped to what
     the deterministic graph captures.

5. **D7 — recursive cycles (SCCs), trust-aware.** Cycles are the
   strongly-connected components of the dependency graph (§1; `imports`
   is essential — circular imports are the canonical finding). An SCC of
   size ≥ 2, or size 1 with a self-edge (direct recursion), is a cycle. A
   cycle is **certain** only if **every edge internal to the SCC** (both
   endpoints in the component) is `deterministic`; any inferred internal
   edge → **candidate** (accent), never asserted. This errs toward
   candidate (an all-deterministic sub-cycle inside an SCC that also holds
   an inferred edge is still candidate) — correct under *never assert a
   cycle that rests on a guess*. Elementary-cycle enumeration (Johnson)
   is rejected: exponential, unbounded.

6. **D7 algorithm — hybrid SQL pre-filter → Tarjan in `@toopo/serve`.**
   SCC *component* enumeration is not expressible as a recursive CTE (a
   CTE yields reachability/membership, not grouping), and the product is
   the *components* ("these files form this circular dependency"). So: a
   portable SQL pre-filter narrows to cycle-candidate nodes (in-degree ≥ 1
   **and** out-degree ≥ 1 on dependency edges — a necessary condition) and
   streams the induced subgraph's `(source_id, target_id, resolution)`;
   **Tarjan runs in the Serve layer** over that bounded stream, producing
   components + per-SCC trust. This honours the blast-radius CTE's
   *principles* (bounded, deterministic, cycle-safe) where they apply and
   uses the proven linear algorithm where SQL cannot. The literal
   recursive-CTE alternative (seeded from all nodes, reusing `path`/
   `path_det`) reuses the machinery verbatim but yields only membership,
   not grouping, and risks O(N·paths) blow-up — rejected for a weaker
   product.

   - **Scaling seam (noted, not built).** Tarjan holds the induced
     subgraph in memory: bounded by one repository's graph, correct for
     v1. A graph store (or an incremental SCC) is the path beyond a single
     process; called out, not pretended free.

7. **The Serve read API gains three global views.** New `@toopo/db`
   read primitives (`nameCollisions`, `unusedSymbols`,
   `cyclicDependencyEdges`) — keyset-paged, project-scoped, dual-backend,
   portable SQL — composed by `GraphViewService` (`@toopo/serve`), exposed
   under `/v1/projects/:projectId/graph/{name-collisions,unused-symbols,
   cycles}` behind the existing `SessionGuard` + `ProjectAccessGuard`
   (ADR-0022/0028). No new auth surface. `unresolvedReferences` gains the
   code-family filter (the ADR-0016 seam, now built): an additive `codes`
   option, no migration.

8. **The Insights surface.** A new sibling route
   `/{locale}/projects/:projectId/insights` (a list surface, a sidebar tab
   beside *Graph*) — not canvas overlays: these are project-global lists,
   not spatial. Three sections reuse the explorer's trust primitives
   verbatim (`TrustMark`, `TRUST_COLOR_VAR`, the `--tp-certain` /
   `--tp-inferred` tokens): certain = neutral grey/recessive, candidate =
   the accent. Rows cross-link into the canvas (select the node / scope the
   level). D6 shows the residual honesty note; D5 shows none (nothing is a
   guess).

9. **Determinism is tested, not assumed.** Collision ordering `(name,
   id)`, SCC id (the smallest member id), and member order are all sorted
   for byte-identical output across input/fragment order; pinned by tests
   mirroring the existing determinism specs.

## Consequences

- The three views ship without ever asserting a falsehood: D6 never calls
  a depended-upon or possibly-reached symbol unused; D7 never asserts a
  cycle resting on an inferred edge; D5 never guesses.
- The ADR-0016 C11 "Phase-D consumption rule" seam is **closed** — the
  code-family filter is built and consumed by D6.
- Two refinements stay **additive, not built**: a variable-level
  (params/locals) collision/unused filter; an "unused import"
  (imported-but-never-called) view. Both layer on the same primitives.
- The D7 in-memory SCC bound is the one noted scaling seam.
- `@toopo/core` is untouched; this extends ADR-0020 additively.

## Alternatives considered

- **Literal usage-set `{calls, references}` (per the original brief).**
  Rejected: false-positive prone (only-imported / only-extended /
  only-implemented symbols), the forbidden direction (§1).
- **All symbols incl. params/locals in D5/D6.** Rejected: noise-dominated;
  buries the actionable signal (§2).
- **Pure recursive-CTE for D7.** Rejected: yields membership not
  grouping, risks O(N·paths); the product needs components (§6).
- **Johnson elementary-cycle enumeration.** Rejected: exponential,
  unbounded (§5).
- **Canvas overlays for the global views.** Rejected: global lists are not
  spatial; overlays fight the canvas metaphor and balloon view state (§8).
- **A "dead code" verdict.** Rejected: the deterministic graph proves
  "no usage detected here," not "dead"; the export fact lets the user
  judge (§4).

## Related ADRs

- ADR-0020 (Serve — extended: three global read primitives + views),
  ADR-0016 (the unresolved tail consumed; its code-family seam closed —
  see that ADR's amendment), ADR-0021 (blast-radius CTE — its discipline
  reused; `path_det` trust pattern), ADR-0015 (trust model — `deterministic
  | inferred`, no fabricated edge), ADR-0027 (local-symbol identity —
  why locals are out of top-level scope), ADR-0022/0028 (project &
  membership access — the views inherit the guard), ADR-0006 (Zod at the
  boundary).
