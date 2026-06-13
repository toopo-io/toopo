# The graph model

Toopo's graph is a **directed property graph**: typed nodes, typed edges, typed properties. The model is universal and language-agnostic — a small closed set of structural kinds carries the shape, and each language adds detail through namespaced sub-kinds without changing the core. It is defined in [ADR-0015](../adr/0015-universal-code-graph-model.md) and owned by `packages/core` as the single source of truth (Zod schemas, with types derived from them).

## Containment hierarchy

Nodes nest in one structural hierarchy, linked by `contains` edges:

```
Repo > Package (optional) > File > Symbol > CallSite
```

| Node kind | What it is |
| --- | --- |
| `repo` | The repository root. |
| `package` | An optional, generic container so monorepos resolve and the model stays language-agnostic. |
| `file` | A source file. Carries an opaque `contentHash` that drives incremental re-parse. |
| `symbol` | A declaration — a function, class, component, type, variable, or a declared parameter/prop. |
| `callSite` | A call or invocation, carrying the arguments passed. Its identity is best-effort. |

A symbol's declared parameters and props are themselves child `symbol` nodes, so "what a component expects" is queryable and zoomable. A call-site carries the actual arguments as a typed payload; where statically resolvable, each passed value links to the parameter or prop it binds — which is how Toopo answers "which props does component A pass to component B."

## Edge kinds

A small closed set of universal edge kinds carries every relationship:

| Edge kind | Meaning |
| --- | --- |
| `contains` | Structural containment (parent → child in the hierarchy). |
| `imports` | A file imports a symbol from another module. |
| `exports` | A file exports a symbol (declaration or re-export). |
| `references` | A non-call usage of a symbol — a type annotation, an `extends` target's type, a variable reference. |
| `calls` | A call-site invokes a symbol. |
| `extends` | A class or interface extends another. |
| `implements` | A class implements an interface. |

This set is **minimal by design**: adding a universal kind later is non-breaking, while renaming or removing one is breaking, so the set is kept correct and minimal rather than exhaustive. For the per-kind detail and how the dependency-traversal views select edges, see [graph edge kinds](../reference/graph-edge-kinds.md).

## Sub-kinds

Every node and edge also carries an open, **language-namespaced** `subKind`. Universal queries run on the universal kinds; language-aware queries key on the sub-kind. For React + TypeScript these include symbol sub-kinds such as `react:component`, `react:hook`, `react:prop`, `ts:parameter`, and `ts:interface`, and edge sub-kinds such as `react:renders` (a sub-kind of `calls`) and `ts:typeRef` (a sub-kind of `references`). Adding a language means new sub-kinds in a `lang-*` package and **zero** change to `core`.

## Trust in the type

Trust is part of the data model, not an afterthought:

- Every edge carries `resolution: 'deterministic' | 'inferred'`.
- Every edge carries a `provenance` — which pass or rule produced it (`parse`, `resolve`, or `ai`).
- An `inferred` edge — and only an inferred edge — additionally carries a coarse `confidence: 'high' | 'medium' | 'low'`. A deterministic edge carries no confidence field at all.

Deterministic and inferred facts are structurally separable and never merged. Prior art (SCIP, Glean, CodeQL) is compiler-grade and therefore always certain; a tree-sitter resolver necessarily infers, so uncertainty is modelled as a first-class property of every edge.

## Identity is logical, not positional

Node identity is a SCIP-style descriptor path — the containment path of stable names — never a line or column. Source position lives on a separate, volatile `location` field. This lets a node survive across commits, which is what makes incremental update and cross-commit tracking possible. Call-site identity (enclosing symbol + callee + source-order ordinal) is explicitly best-effort and can shift when calls are added, removed, or reordered, so any cross-commit tracking anchors to the more stable Symbol or File level.

---

**See also:** [Graph edge kinds](../reference/graph-edge-kinds.md) · [How the graph works](how-the-graph-works.md) · [ADR-0015](../adr/0015-universal-code-graph-model.md) · [ADR-0027](../adr/0027-local-symbol-identity.md) (local-symbol identity).
