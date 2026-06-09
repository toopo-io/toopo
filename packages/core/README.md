# @toopo/core

The universal, language-agnostic **code-graph model** — the single source of
truth for Toopo's map (ADR-0015). The parser produces it, storage persists it,
the AI overlay consumes scoped subgraphs of it, and the UI derives every zoom
view from it.

## Role

`core` defines the FORMAT and the types intrinsic to it — nothing else:

- the node/edge schemas (Zod is the source of truth; TypeScript types are
  `z.infer`-derived),
- stable **identity** (a SCIP-style descriptor path) and its codec,
- the **trust** discriminator (`deterministic | inferred` + confidence),
- pure **guards/validators** and the canonical **comparator**.

It contains **no persistence, no parsing, no traversal, and no AI** — those
belong to `parser`, `resolver`, `db`, and the serve/analysis layers.

## Constraints

- **Dependency-light (ADR-0015):** zero bundled runtime dependencies; `zod` is
  the ONLY dependency, declared as a peer. `core` imports no internal package.
- Pure, framework-agnostic TypeScript. Immutable: helpers return new values
  and never mutate inputs.

## The model (ADR-0015)

- **Nodes** — five CLOSED structural kinds in a containment hierarchy:
  `repo > package > file > symbol > callSite`, linked by `contains` edges.
- **Edges** — seven CLOSED kinds: `contains`, `imports`, `exports`,
  `references`, `calls`, `extends`, `implements`. Stored once in their natural
  (forward) direction; reverse traversal is derived downstream.
- **`subKind`** — every node/edge carries an open, language-namespaced
  refinement (`react:component`, `ts:typeRef`). Adding a language adds
  subKinds in a `lang-*` package with ZERO core change.
- **`properties`** — an open, JSON-safe bag; `lang-*` refine it per-subKind via
  the pure `withProperties(base, langProps)` factory.
- **Trust** — every edge is `deterministic` or `inferred`; `confidence`
  (`high|medium|low`) exists **iff** the edge is `inferred`. Enforced
  structurally by a discriminated union, not by convention.
- **Analysis status** — `analyzed | unsupported-language | parse-error |
  skipped`; a non-`analyzed` status always carries a reason (graceful
  degradation).
- **`contentHash`** — an opaque string on file nodes. The hashing ALGORITHM is
  the parser's, not core's.

## Identity encoding

Node identity is a **stable SCIP-style descriptor path** — the containment path
of stable names, never line/column (position lives in the volatile `location`
field). Two representations are losslessly inter-derivable:

- structured `SymbolIdentity` (`{ package?, descriptors }`) — for manipulation;
- encoded `SymbolId` string — the canonical **storage key**.

`formatSymbolId` / `parseSymbolId` convert between them. The string grammar
follows SCIP (verified against `sourcegraph/scip`):

```
local symbol    ::= <descriptor>+
external symbol ::= <manager> ' ' <name> ' ' <descriptor>+

<descriptor> ::= <name> '/'        (namespace)
              |  <name> '#'        (type)
              |  <name> '.'        (term)
              |  <name> ':'        (meta)
              |  <name> '!'        (macro)
              |  <name> '(' <disambiguator>? ').'  (method)
              |  '[' <name> ']'    (type-parameter)
              |  '(' <name> ')'    (parameter)
```

- **Names** are simple (`[A-Za-z0-9_+\-$]+`) or backtick-escaped, with embedded
  backticks doubled.
- **Spaces** inside a package coordinate are escaped as a double space, so a
  local id has no top-level single space and an external id has exactly two —
  the two forms are unambiguous.
- **External package coordinate is `manager` + `name` ONLY.** The package
  **version is excluded from identity on purpose** (ADR-0015 Fork 1): including
  it would churn every external-ref id on a dependency bump and break
  cross-commit identity stability. Version, if needed, is a non-identity
  `property`.
- **Call-site identity is best-effort** (`composeCallSiteId`): the enclosing
  symbol id + callee reference + source-order ordinal. It can shift when calls
  are added/removed/reordered, so cross-commit tracking must anchor to Symbol
  or File and use the call-site only as a refinement pointer.

## Determinism

`compareNodes` / `compareEdges` (and `sortNodes` / `sortEdges` /
`canonicalizeGraphDocument`) impose a total, stable order by logical identity.
The parser and storage share this one comparator so their outputs cannot drift
(ADR-0016 byte-identical graphs).

## Graph document

`GraphDocument` (`{ formatVersion, nodes, edges }`) is the serialization unit.
It is a **fragment**, not only a whole-repo dump: it carries whatever set of
nodes/edges is produced or applied — exactly what a parser emits for one
changed file in the file-level incremental flow (ADR-0016). Empty `nodes` /
`edges` are valid.

## Adding to the model

Adding a `subKind` or refined `properties` is **downstream** work in a `lang-*`
package — never a change here. Changing the closed node/edge kind sets requires
superseding ADR-0015 with a new ADR.
