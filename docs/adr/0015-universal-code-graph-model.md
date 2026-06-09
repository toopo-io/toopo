# ADR 0015: Universal code-graph model (packages/core)

Date: 2026-06-08
Status: Accepted

## Context

Toopo's foundation is a deterministic graph of a codebase, refreshed on
every push (delta-only re-analysis of changed files). Both products read
this one graph: the visual cartography, and later the scoped AI analysis
that traverses the graph instead of feeding a whole repo to an LLM.

The pipeline is Parse → Resolve → Serve. tree-sitter (the chosen engine)
produces a per-file concrete syntax tree only; it has no cross-file or
semantic layer, and its `tags`/`locals` queries resolve names within a
single file. Cross-file binding is therefore our Resolve pass. We reject
GitHub stack-graphs for it: their per-language resolution DSL is costly
to author, ships only four languages, and is hard to verify against
language semantics — unacceptable for a tool that must extend to Vue,
Angular, Svelte, and Python without touching the core.

This ADR defines only the language-agnostic data model that the future
`packages/core` owns — the single source of truth for the map. Storage
(SQLite self-host / Postgres cloud behind an interface) is out of scope
and will supersede ADR-0012 in a separate ADR; the model here is
storage-agnostic.

## Decision

The model is a directed property graph defined by the following points.

1. **Property graph.** Nodes, typed edges, typed properties — the
   validated convention for code graphs (Code Property Graph / Joern;
   Glean and CodeQL are Datalog-isomorphic to it).

2. **Containment hierarchy.** Repo > Package (optional, generic
   container so monorepos resolve and the model stays language-agnostic)
   > File > Symbol > CallSite, linked by `contains` edges. Roll-up is
   aggregation over containment.

3. **One parse, derived views.** A single parse yields the finest
   *useful* grain — Symbol plus CallSite, plus a symbol's declared
   parameters/props (point 6) — deliberately coarser than AST-node
   grain, which the CPG literature identifies as the dominant size cost.
   Zoom levels and aggregates (component↔component, file, package) are
   views computed on read, never stored as canonical and never a
   re-parse.

4. **Stable logical identity (best-effort for call-sites).** Node
   identity is a SCIP-style descriptor path — the containment path of
   stable names — never line or column. Position is metadata on a
   separate, volatile `location` field. This lets nodes survive across
   commits, enabling incremental update and tracking a problem across
   commits. CallSite identity is the enclosing symbol's id + the callee
   reference + a source-order ordinal among identical calls. This
   call-site key is **heuristic and best-effort**: it can shift when
   calls are added, removed, or reordered within the enclosing symbol.
   Consequently, any cross-commit tracking (the future kanban) must
   anchor a problem to the most stable available containment level —
   Symbol or File — and treat the call-site only as a refinement
   pointer, never as the sole stable anchor. (SCIP and Glean are the
   exemplars for stable identity; LSIF's opaque numeric ids are the
   rejected anti-pattern.)

5. **Universal kinds, namespaced subKinds.** A small CLOSED set of
   universal, structural kinds carries the shape:
   - node kinds: `repo`, `package`, `file`, `symbol`, `callSite`
   - edge kinds: `contains`, `imports`, `exports`, `references`,
     `calls`, `extends`, `implements`

   Every node and edge also carries an open, language-namespaced
   `subKind` (e.g. symbol `react:component`, `react:hook`,
   `ts:parameter`, `react:prop`; edge `react:renders`, `ts:typeRef`).
   Universal queries run on universal kinds; language-aware queries on
   subKinds. Adding a language means new subKinds in a `lang-*` package
   and ZERO core change.

   This set is **minimal by design**. Adding a universal kind later is
   **non-breaking**; only renaming or removing one is breaking.
   Therefore the closed set is ratified without requiring it to be
   exhaustive — it must be correct and minimal, not complete. (Glean's
   per-language schemas + universal views; the archived GitHub Semantic
   project is the cautionary tale — a forced universal AST with
   hand-written assignment was brittle and was abandoned for per-language
   generated types, so our universal layer stays thin and structural.)

6. **Declared interface of a symbol.** A symbol's declared
   parameters/props are modeled as child Symbol nodes contained by it
   (subKinds e.g. `ts:parameter`, `react:prop`), each declaring its type
   via a `references` edge to the type symbol where named (subKind
   `ts:typeRef`; `deterministic` when statically resolvable, otherwise
   `inferred`/unknown per point 8). This makes "what a component expects"
   queryable and zoomable, consistent with one-parse/derived-views, and
   enables deterministic analyses such as "unused prop" — a declared
   prop with zero incoming links from call-site payloads (point 7).
   Parameters/props reuse the existing universal kinds (they are
   `symbol`; type usage is `references`), so the point-5 closed sets
   stand with no additions. Their grain stays far coarser than AST-node
   grain (a handful per symbol), so it does not reintroduce the CPG size
   blow-up.

7. **CallSite payload.** A CallSite carries the actual arguments/props
   passed, as a typed payload. Each passed value links, where statically
   resolvable, to the receiving parameter/prop (the declared-interface
   child symbols of point 6); unresolved cases — spread `{...props}`,
   dynamic values — are marked `inferred`/unknown per the trust
   principle (point 8). This is a primary product requirement
   ("component A passes these props to component B") and is first-class
   in the model, not derived.

8. **Trust in the type.** Every edge carries `resolution:
   'deterministic' | 'inferred'`, a `provenance` (which pass/rule
   produced it), and, for `inferred` edges only, a coarse `confidence:
   'high' | 'medium' | 'low'`. Deterministic edges carry no confidence.
   Deterministic and inferred facts are structurally separable and never
   merged. Prior art (SCIP, Glean, CodeQL) is compiler-grade and
   therefore always deterministic; a tree-sitter resolver necessarily
   infers, so uncertainty is first-class — certain and uncertain must
   always be distinguishable, in the data and in the UI.

9. **Graceful degradation.** File and node entries carry an analysis
   status (`analyzed | unsupported-language | parse-error | skipped`)
   with a reason. Unsupported or broken inputs degrade locally; a
   mixed-language or partially-broken repo never fails the whole
   analysis.

10. **Incremental by content hash.** Each File node carries an opaque
    `contentHash` string; a changed file (hash mismatch) re-parses only
    its subgraph. The hash *algorithm* is not part of the model — see
    "Content-hash algorithm" below.

11. **Forward edges only; reverse derived.** The canonical graph stores
    each relationship once, in its natural direction. "Who calls X / who
    is called by X" is a traversal; reverse indexes are built by the
    storage and serve layers, never duplicated in the canonical model.

### Validation and dependencies

`packages/core` owns the model as **Zod schemas as the single source of
truth**, with TypeScript types derived via `z.infer` (zero duplication).
This honors ADR-0006 (Zod as the project's validation source of truth)
and lets every boundary that brings data back into the model — storage
deserialization, AI-produced graph mutations, webhook-triggered parse
output — validate against the same schemas, per our validate-at-
boundaries standard. `zod` is declared as a **peer dependency**, not a
bundled one: every consumer is already on Zod 4, so `core` stays
dependency-light — **zero bundled runtime dependencies, one peer
dependency (`zod`)**.

### Content-hash algorithm (consciously supersedes the original XXH3 assumption)

The model only mandates an opaque `contentHash` string; the algorithm
lives in the parser pipeline, not in `core`. The default is **Node's
built-in `crypto` `sha256`**: zero dependencies, no native build,
SHA-NI-accelerated on modern CPUs, and 256-bit so accidental collisions
are a non-concern. For KB-scale source files, hashing time is dominated
by file I/O, so this is not a measured bottleneck.

This **deliberately overrides the project's earlier "XXH3" assumption**.
XXH3 is faster in microbenchmarks, but for a tool whose hard constraint
is trivial self-hosting, the maintained XXH3 paths are either a WASM
dependency or a prebuilt-native matrix, and the full-128-bit native
addon can compile on install — exactly the fragility to avoid. xxHash is
therefore adopted only if profiling proves hashing is hot, and then only
via `xxhash-wasm` / `@node-rs/xxhash` (WASM or prebuilt), never a
compile-on-install addon. Keeping the algorithm out of `core` preserves
its dependency-light role.

## Consequences

- `core` is the single language-agnostic source of truth: the parser
  produces it, storage persists it, AI consumes scoped subgraphs of it,
  the UI derives every zoom view from it.
- A larger stored graph buys cheap reads, cheap aggregation, and cheap
  AI scoping — the correct trade for a read-heavy, parse-incremental
  product.
- New-language support never touches `core` — the central extensibility
  guarantee.
- Deterministic analyses are free graph algorithms over the stored
  graph: unused symbol = zero in-degree; unused prop = a declared prop
  with no incoming call-site payload links; recursion = a cycle.
- The closed universal kind and edge sets are minimal by design; adding
  a kind later is non-breaking, renaming or removing one is breaking.
- Call-site identity is best-effort, so cross-commit problem tracking
  anchors to Symbol or File and uses the call-site only as a refinement
  pointer.
- Graph size at fine grain is the known risk, mitigated by the symbol +
  call-site (+ declared-interface) grain rather than AST-node, and by
  derived rather than stored views.

## Alternatives considered

- **SCIP / LSIF as the format.** SCIP's descriptor symbols are excellent
  and we adopt the idea, but SCIP is an occurrence index for code
  navigation — no call-site payloads, no derived zoom, no uncertainty
  model. LSIF is rejected outright: opaque ids, verbose, non-incremental.
- **stack-graphs as the model.** Rejected: per-language DSL authoring
  cost, four languages shipped, hard-to-verify correctness.
- **A universal abstract AST (old GitHub Semantic).** Rejected:
  documented failure mode (brittle hand-written assignment, two grammars
  per language); namespaced subKinds avoid it.
- **Full Code Property Graph AST-node grain.** We adopt the
  property-graph shape but reject AST-node grain as canonical — size
  blowup; our grain is product-driven (symbol + call-site + declared
  interface).

## Related ADRs

- ADR-0004 (build-distributed shared packages — `core` is one)
- ADR-0006 (Zod as single source of truth — `core` owns the model as Zod
  schemas with `z.infer` types; `zod` is a peer dependency, so `core`
  has zero bundled runtime dependencies)
- ADR-0012 (database — to be superseded by a storage-interface ADR;
  `core` is storage-agnostic)
