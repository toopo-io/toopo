# Glossary

The vocabulary used throughout Toopo and these docs.

**Blast radius** — the set of symbols that depend, directly or transitively, on a given symbol: "who breaks if I change this?" Computed as a bounded reverse traversal of the usage edges. Each hit is marked proven or inferred (see *path trust*).

**Call-site** — a single call or invocation in the source, carrying the arguments passed. Its identity (enclosing symbol + callee + source-order ordinal) is best-effort and can shift when calls are added, removed, or reordered.

**Candidate** — a finding Toopo cannot prove with certainty, marked as uncertain rather than asserted. The opposite of *certain*. A symbol with no detected usage is a candidate (not "dead") if any unresolved reference could reach it; a cycle is a candidate if any edge in it is inferred.

**Certain / uncertain** — the core distinction. A *certain* fact is statically proven; an *uncertain* one is inferred or unresolvable. The two are always structurally separable, in the data and in the UI.

**Content hash** — an opaque per-file hash (`sha256` of the file bytes). A push re-parses a file only when its content hash changed, which is what makes analysis delta-only.

**Deterministic / inferred** — the `resolution` of an edge. `deterministic` means statically proven; `inferred` means heuristically guessed, and carries a coarse `confidence`. The deterministic layer (Parse + Resolve) produces no inferred-by-AI edges.

**Edge kind** — the type of a relationship: `contains`, `imports`, `exports`, `references`, `calls`, `extends`, `implements`. See [graph edge kinds](../reference/graph-edge-kinds.md).

**Insights** — the deterministic global views: name collisions, unused symbols, and recursive cycles. See [the Insights guide](../guides/insights.md).

**Node kind** — the type of a node: `repo`, `package`, `file`, `symbol`, `callSite`.

**Path trust** — for a blast-radius hit, whether *some* fully-deterministic dependency path reaches it (then the hit is `deterministic`) or *every* path traverses at least one inferred edge (then it is `inferred`). Depth and trust are independent. See [ADR-0021](../adr/0021-blast-radius-per-hit-path-trust.md).

**Project** — the administrative entity Toopo manages for one connected repository, distinct from the `repo` node inside the graph. See [workspaces and projects](workspace-and-projects.md).

**Recursive cycle** — a strongly connected component of the dependency graph: a set of symbols that depend on each other in a loop. Found via Tarjan's algorithm. Certain only if every edge in it is deterministic.

**Sub-kind** — an open, language-namespaced refinement of a kind, e.g. `react:component`, `ts:parameter`, `react:renders`. Universal queries ignore it; language-aware queries key on it.

**Symbol** — a declaration: a function, class, component, type, variable, or a declared parameter/prop.

**Unresolved-reference tail** — the persisted, honest record of references the resolver could not bind. Never a fabricated edge; it is what keeps the unused-symbol and cycle views from mistaking a resolution gap for genuine absence.

**Workspace** — the tenancy boundary that owns projects; membership in it is the access predicate. Technically a Better Auth organization. See [workspaces and projects](workspace-and-projects.md).
