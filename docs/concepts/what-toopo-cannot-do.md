# What Toopo cannot do

Toopo is built on a trust principle: one false positive destroys trust, so it would rather miss a real issue than cry a false one. Living up to that means being explicit about its limits. This page is the honest boundary — read it before you rely on a result.

## It does not run your code

Toopo is a **static** tool. It reads, parses, and analyses source; it never executes it. There is no runtime tracing, no profiling, no observation of what actually happens at run time. Analysed repository content is treated as untrusted input — read and parsed, never run.

## Its resolution is heuristic, not compiler-grade

Cross-file resolution is done by a custom heuristic resolver over tree-sitter, not by a compiler or a language server ([ADR-0016](../adr/0016-parsing-and-resolution-strategy.md)). It robustly handles the dominant import shapes — direct imports, barrel re-exports, namespace imports, `tsconfig` path aliases — but it is not a full type system. Some references it cannot statically bind.

## Inferred is flagged, never hidden

When the deterministic passes cannot prove a relationship, the result is **not** dropped silently and **not** dressed up as certain:

- Every edge carries `resolution: 'deterministic' | 'inferred'`. Inferred edges additionally carry a coarse `confidence`. Certain and uncertain facts are structurally separable, in the data and in the UI.
- A reference the resolver cannot bind at all does not become a fabricated edge. It is recorded in a persisted **unresolved-reference tail** — an honest record that "there is an inbound usage here we could not resolve."

That tail is load-bearing for honesty. The [unused-symbol view](../guides/insights.md) marks a symbol *certain-unused* only when it has zero incoming usage edges **and** nothing in the tail could reach it; otherwise the symbol is a **candidate**, never "dead." One blind spot remains and is disclosed rather than hidden: a bare-identifier call that names no import (typically a local or a global) is out of the usage tail, so unused-symbol results account for member-access gaps but not bare-identifier ones. The view surfaces the **exported / non-exported** fact for each symbol so you can tell a public API with no internal use apart from likely-dead code yourself.

A dependency cycle is reported as *certain* only when every edge inside it is `deterministic`; if any edge is inferred, the cycle is a candidate. Name collisions are pure parse facts, so they are always certain.

## AI is never in the deterministic pass

The deterministic graph contains no AI. When the [scoped AI analysis](what-is-toopo.md) ships, it will resolve **only** the bounded set of cases the deterministic passes left unresolved, as an `inferred` overlay that is excluded from the byte-identical guarantee and cached separately. It will never rewrite or contaminate the deterministic graph, and it is never asked to read a whole repository.

## Nothing is auto-merged

When the analysis layer proposes a fix (planned), it opens a pull request you review and that must pass your own CI. Toopo never merges on your behalf.

## Language coverage is deliberately narrow today

Only **React + TypeScript** (`.ts`, `.tsx`) is shipped. JavaScript (`.js`/`.jsx`/`.mjs`/`.cjs`) and other languages (Vue, Angular, Svelte, Python) are planned, each as a new `lang-*` package. A file in an unsupported language is marked and skipped — never fatal; a mixed-language repository still produces a graph for the parts Toopo understands.

---

**See also:** [How the graph works](how-the-graph-works.md) · [The graph model](graph-model.md) · [Insights](../guides/insights.md).
