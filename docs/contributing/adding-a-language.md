# Adding a language

> This is a thin outline. A full guide will accompany the second language; this page records the shape of the work.

Adding a language is the central extensibility guarantee: a new `lang-*` package behind the language interface, with **zero** change to `core` or the pipeline ([ADR-0015](../adr/0015-universal-code-graph-model.md), [ADR-0016](../adr/0016-parsing-and-resolution-strategy.md)).

A `lang-*` package owns three things:

1. **The grammar** — a compiled tree-sitter `.wasm`, built from a pinned grammar source revision via a checked-in, reproducible CI build (never built on a contributor's or self-hoster's machine), and vendored in the package.
2. **The extraction queries** — the tree-sitter S-expression queries that pull the language's symbols, call-sites, and declared interfaces out of the syntax tree.
3. **The sub-kind mapping and resolution rules** — how the language's constructs map to the universal node/edge kinds and namespaced sub-kinds, and the language-specific parts of cross-file resolution.

`lang-react` is the reference implementation. Single-file-component languages (Vue, Svelte, Angular) compose a template grammar with the TypeScript grammar inside their plugin — that composition, not grammar availability, is the real per-language cost.

---

**See also:** [Architecture overview](../architecture/overview.md) · [How the graph works](../concepts/how-the-graph-works.md) · [ADR-0016](../adr/0016-parsing-and-resolution-strategy.md).
