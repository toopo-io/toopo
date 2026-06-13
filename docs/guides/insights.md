# Insights

Insights are Toopo's deterministic, repository-wide views. Where the map is for exploring, Insights are for findings: a list surface that answers three global questions about your code. They are defined in [ADR-0029](../adr/0029-deterministic-global-derived-views.md), and trust is at their heart — each row is marked *certain* or *candidate*, and the accent is reserved for uncertainty.

All three views consider only **top-level symbols** (a symbol directly contained by its file) — not parameters, locals, or call-sites. Rows cross-link back into the map.

## Name collisions

Top-level symbols that share a name. This is a pure parse fact — there is no inference involved — so **every** name-collision row is certain. No accent, no doubt.

## Unused symbols

Top-level symbols with no detected incoming usage. This view is where honesty matters most, so its rule is exact:

A symbol is **certain-unused** only when *all* of these hold:

1. It has **zero incoming usage edges** (across `imports`, `references`, `calls`, `extends`, `implements`).
2. No `unresolved-member` reference in the [tail](../concepts/how-the-graph-works.md) is anchored to its file **and** its name.
3. No `unbound-callee` reference in the tail names it.

If any of those could reach the symbol, it is a **candidate** instead — possibly used, never asserted unused. The label is *"no usage detected in this graph and tail,"* never "dead."

Each row also surfaces whether the symbol is **exported**, so you can tell a deliberately-public API with no internal callers apart from genuinely dead code yourself. One residual is disclosed, not hidden: a bare-identifier call that names no import (a local or a global) is outside the usage tail, so it cannot exonerate a symbol — this is a known, documented blind spot.

## Recursive cycles

Sets of symbols that depend on each other in a loop — strongly connected components of the dependency graph, found via Tarjan's algorithm over a bounded induced subgraph (a SQL in/out-degree pre-filter narrows the candidates first).

A cycle is **certain** only when *every* edge inside it is `deterministic`. If any internal edge is inferred, the whole cycle is a **candidate**. Cycle ordering, the cycle's id, and member order are all sorted, so the same commit always yields the same cycles in the same order.

---

**See also:** [What Toopo cannot do](../concepts/what-toopo-cannot-do.md) · [Reading the map](reading-the-map.md) · [REST API](../reference/rest-api.md) · [ADR-0029](../adr/0029-deterministic-global-derived-views.md).
