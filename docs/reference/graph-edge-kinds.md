# Graph edge kinds

Edges carry every relationship in the graph. The set of edge **kinds** is universal and closed — defined in `packages/core` ([ADR-0015](../adr/0015-universal-code-graph-model.md) §5). Adding a kind later is non-breaking; renaming or removing one is breaking, so the set is kept minimal and correct rather than exhaustive. Language-specific richness lives in the open, namespaced `subKind` of each edge, never in this set.

## The kinds

| Kind | Direction | Meaning |
| --- | --- | --- |
| `contains` | parent → child | Structural containment in the node hierarchy (repo → file → symbol → call-site). Always a deterministic parse fact. |
| `imports` | importer → imported | A file imports a symbol from another module. |
| `exports` | file → symbol | A file exports a symbol (a declaration or a re-export). |
| `references` | user → used | A non-call usage of a symbol — a type annotation, a variable reference, the type in an `extends` clause. |
| `calls` | caller → callee | A call-site invokes a symbol. |
| `extends` | subtype → supertype | A class or interface extends another. |
| `implements` | class → interface | A class implements an interface. |

## Sub-kinds

Every edge also carries a language-namespaced `subKind` (`<namespace>:<name>`, e.g. `react:renders`). Two worth knowing for React + TypeScript:

- **`react:renders`** is a sub-kind of `calls` — a JSX render is modelled as a call, not as its own edge kind. So "what does this component render" is answered by the `calls` traversal.
- **`ts:typeRef`** is a sub-kind of `references` — a type usage (e.g. a prop declaring its type) is a reference to the type symbol.

## The dependency edge-set

Several views need "which edges constitute a dependency." That set is `DEFAULT_BLAST_RADIUS_KINDS`:

```
imports · references · calls · extends · implements
```

It deliberately **excludes** `contains` (pure structure, not a dependency) and `exports` (a symbol's own declaration, not a dependent). This one set is reused across the blast radius, the unused-symbol view, and the cycle view ([ADR-0029](../adr/0029-deterministic-global-derived-views.md)), so "depends on" means the same thing everywhere. Because `react:renders` is a sub-kind of `calls`, render relationships are already covered.

## Trust

Independent of its kind, every edge carries `resolution: 'deterministic' | 'inferred'`, a `provenance` (`parse` \| `resolve` \| `ai`), and — for inferred edges only — a coarse `confidence`. See [the graph model](../concepts/graph-model.md) for how trust is represented.

---

**See also:** [The graph model](../concepts/graph-model.md) · [Reading the map](../guides/reading-the-map.md) · [Insights](../guides/insights.md).
