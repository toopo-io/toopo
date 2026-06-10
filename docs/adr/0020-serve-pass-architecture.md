# ADR 0020: Serve-pass architecture — read API, derived views, pagination

Date: 2026-06-09

Status: Accepted

## Context

ADR-0015 defines the graph and its derived-views principle; ADR-0016 names
the third pipeline pass, **Serve** — "the queryable graph and its derived
zoom/aggregate views"; ADR-0017 persists the graph and notes deep traversals
"must be capped/paginated". This ADR fixes *where* Serve lives and *how* the
graph is read, so the cartography UI has a stable read layer. It decides
structure, not the model (ADR-0015) or storage (ADR-0017), which it obeys.

## Decision

1. **Three layers, one-way.** Read SQL lives in **`@toopo/db`** (the only place
   with the Kysely schema and the portable-SQL dual-backend CI of ADR-0017 §6).
   The **Serve pass** — the view catalog, response composition (node-detail
   assembly), trust surfacing, and bounding policy — lives in a new
   **`packages/serve`**, depending on the `GraphRepository` interface alone and
   holding no SQL. **`apps/api`** is a thin HTTP skin. Direction:
   `apps/api → packages/serve → @toopo/db → @toopo/core`, no cycle. Folding the
   composition into `@toopo/db` was rejected: it conflates persistence with
   serving (ADR-0017 scopes `db` to persistence) and the catalog grows with the
   UI; putting it in `apps/api` was rejected (apps carry no business logic).

2. **REST + Zod contracts.** The read API is REST via Nest with the request and
   response schemas in **`@toopo/api-contracts`**, shared FE/BE as the single
   source of truth (ADR-0006). Response shapes embed the canonical core
   Node/Edge schemas (never re-declared), so every edge carries
   `resolution`/`confidence` — trust is visible to the UI (ADR-0015 §8).
   GraphQL was rejected: it duplicates the schema source of truth and adds
   runtime weight against the self-host constraint, for a small fixed catalog.

3. **Views computed on read.** Zoom and aggregate views are computed per request
   over the containment hierarchy (ADR-0015 §3) — never stored, never a
   re-parse. Materialized views are precluded unless a future ADR supersedes
   this (YAGNI).

4. **Keyset pagination, always bounded.** Every list is keyset/cursor-paginated
   (opaque cursor, never offset) under one envelope `{ items, nextCursor,
   total? }`; the map is always scoped to a subtree and node-count-capped; the
   blast radius carries an explicit `truncated` flag when the depth cap is
   reached. No response is unbounded and no truncation is silent.

5. **The catalog (V1–V5).** Map (package/file/symbol, with trust-split projected
   edges), node detail (declared interface + neighbours + call-sites), neighbours,
   blast radius, and search — plus the declared-interface and call-site zoom-in
   lists. This shape also accommodates the next deterministic-analysis views
   (unused symbols = zero internal incoming dependency edges; recursive cycles),
   surfaced honestly as candidates, never asserted (the trust principle).

6. **Populate path.** A minimal **`apps/worker`** CLI (`ingest <dir>
   --database-url <url>`) composes `@toopo/ingest` and `@toopo/db` to populate
   the database — the precursor to the real webhook/queue worker (deferred to
   the queue ADR). Only additive indexes are added to storage (an index on
   `node.enclosing_symbol_id` for call-site lookup); a name-search index is
   deferred (a bounded `LIKE` suffices at this scale).

## Consequences

- The read layer is reusable (Serve depends on the repository interface, not a
  backend) and the portable-SQL discipline stays in one place (ADR-0017 §6).
- Trust (deterministic vs inferred) is carried end to end, ready for the UI.
- Bounded-by-construction reads keep the API safe on large graphs.
- Standing cost: a new package and a new app to maintain; the populate CLI's
  composition moves into the worker when the queue ADR lands.

## Alternatives considered

- **Composition inside `@toopo/db`** — rejected (single-responsibility, ADR-0016
  pass separation).
- **GraphQL** — rejected (schema duplication, runtime weight, open-query surface
  unneeded for a fixed catalog).
- **Materialized/stored views** — precluded by ADR-0015 §3 unless superseded.
- **Offset pagination** — rejected (drifts and scans on large graphs).

## Amendment — 2026-06-10 (C11): unresolved-reference read primitive

The catalog (§5) gains `GraphRepository.unresolvedReferences(scope, options?)` —
the keyset-paginated, project-scoped read over the **persisted** unresolved tail
of the Resolve pass (ADR-0016 amendment), with an optional `targetFileId` filter.
It is a sibling of the graph, not a node/edge view: an unbindable usage is
surfaced as an explicit unresolved reference, never a fabricated edge, so the
forthcoming deterministic "unused"/"cycle" views (§5) stay honest — they consult
this primitive before asserting absence. Same envelope, keyset pagination, and
project-scoping discipline as the rest of the catalog; persisted (transactionally,
with the graph) rather than computed on read, because it records a fact the read
cannot reconstruct (which usages failed to bind).

## Related ADRs

- ADR-0015 (model — derived views, trust, containment), ADR-0016 (Serve named as
  the third pass; the persisted unresolved tail), ADR-0017 (storage — portable
  SQL, capped/paginated traversal), ADR-0006 (Zod single source of truth),
  ADR-0014 (route URLs centralized), ADR-0008 (explicit migrations, never on boot).
