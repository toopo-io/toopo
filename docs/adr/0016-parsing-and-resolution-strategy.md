# ADR 0016: Parsing and resolution strategy

Date: 2026-06-08
Status: Accepted

## Context

ADR-0015 defines *what* the code graph is — its nodes, edges, stable
identity, and the `deterministic | inferred` distinction. This ADR
defines *how* the graph is produced from source: the parsing engine, the
cross-file resolution approach, the pipeline shape, and the guarantees
that make the result cacheable and incrementally updatable. It does not
restate the data model; see ADR-0015.

The product analyses a repository on every push (delta-only), starting
with React/Next TypeScript and extending to Vue, Angular, Svelte, and
Python without re-architecting. Two constraints dominate: **trivial
self-hosting** (a plain `npm install`, every platform, no native
build) — the same constraint that chose Node built-in `sha256` over
native xxHash in ADR-0015 — and **strict determinism**, so caching and
incremental updates are correct.

## Decision

### Engine: tree-sitter

tree-sitter is the parsing engine: a per-file concrete syntax tree, S-
expression queries, and error-tolerant parsing. Each `lang-*` plugin owns
the queries that extract its symbols, call-sites, and declared interfaces
(ADR-0015) from the tree. tree-sitter is per-file and syntactic only; it
performs no cross-file or semantic resolution — that is our Resolve pass.

### Rejected resolution approaches

- **GitHub stack-graphs.** Per-language resolution must be authored in a
  graph-construction DSL; only four languages ship, the rules are hard to
  verify against language semantics, and the authoring cost blocks our
  Vue/Angular/Svelte/Python extensibility.
- **LSP-based resolution.** Proven slow and unreliable for this batch,
  whole-repo, multi-language use case; it also couples us to per-language
  language servers and their lifecycles.

We instead use a **custom heuristic resolver over tree-sitter** (below).

### Pipeline: three passes

1. **Parse** — per file, tree-sitter via WASM. Produces that file's local
   facts (symbols, call-sites with payloads, declared interfaces) as
   defined in ADR-0015. Pure function of file bytes; fully deterministic.
2. **Resolve** — cross-file binding, batched per language. A custom
   heuristic resolver links imports and references across files. Target
   ~90% of imports resolved heuristically: direct imports, barrel
   `index.ts` re-exports, namespace imports, and `tsconfig` path aliases.
   Module/import resolution operates on language-agnostic module
   specifiers; symbol-level resolution detail is per-language. Every edge
   is tagged `deterministic` or `inferred` per ADR-0015. This pass
   contains no AI.
3. **Serve** — the queryable graph and its derived zoom/aggregate views
   (ADR-0015). Reverse indexes (who-calls-X) are built here, not stored
   in the canonical graph.

The goal for the resolver is **robustness at ~90%, not theoretical
perfection** — heuristics that cover the dominant real-world import
shapes, with everything they cannot resolve made explicit rather than
guessed.

### AI as last resort, outside the deterministic layer

Statically unresolvable cases — spread `{...props}`, dynamically chosen
components, dependency injection — are left `inferred`/unknown by the
deterministic passes. AI may later resolve *only those bounded nodes*,
never the whole repo. AI-derived facts are an `inferred` overlay; they
are not part of the deterministic graph and carry confidence per
ADR-0015. This bounds cost and keeps determinism intact.

### Runtime binding: WASM (web-tree-sitter)

The engine runs as WebAssembly via `web-tree-sitter`, not native
bindings. Native `tree-sitter` installs through `node-gyp-build` and
falls back to compiling from source (Python + C/C++ toolchain) whenever a
prebuilt binary does not match the host; prebuild coverage is incomplete
and regressing (no Node 24 prebuilds, install failures on recent macOS,
unclear ARM/musl/Windows), and the risk multiplies across every grammar.
`web-tree-sitter` has zero runtime dependencies, needs no compiler, ships
one `.wasm` that runs identically on every platform, and supports both
incremental reparse and holding many grammars in one process. Its
constant-factor parse slowdown versus native is immaterial for batch
per-push parsing.

### Grammar packaging: self-built WASM behind the lang-* interface

Grammars are compiled `.wasm`, loaded via `Language.load`. Each `lang-*`
plugin declares the grammar(s) it needs and its extraction queries.

Each vendored grammar `.wasm` is built from a **pinned grammar source
revision** via a **checked-in, reproducible build script run in CI** —
never on a self-hoster's or contributor's machine — and the resulting
`.wasm` is vendored inside its `lang-*` package. This gives auditable
provenance (the binary is reproducible from a known source revision, not
an opaque committed blob) while keeping installation build-free for
everyone. Building grammars on install was rejected: it reintroduces the
exact toolchain friction the WASM choice removes. The build script uses
`tree-sitter build --wasm` (which bundles `wasi-sdk`, auto-downloaded — no
native toolchain). Prebuilt packs such as `tree-sitter-wasms` may be used
to *seed* the build, never as a runtime dependency.

Single-file-component languages (Vue, Svelte, Angular) compose a template
grammar with the TypeScript grammar inside their plugin; this composition,
not grammar availability, is the real per-language cost.

### Incremental granularity: file-level

Re-analysis is file-level: a changed content hash (ADR-0015) triggers a
full reparse of that file from scratch; unchanged files are skipped
entirely. Sub-file `Tree.edit` reuse is deliberately not used — it
requires byte-precise edit ranges that a commit diff does not provide,
adds a diff-to-byte-range stage, and yields nothing when the whole file
is re-read anyway. The savings come from skipping unchanged files, not
from intra-file tree reuse.

### Determinism

The same commit must produce a byte-identical deterministic graph —
required for correct caching and incremental updates. The deterministic
layer (Parse + Resolve) therefore contains no AI and no nondeterministic
ordering; outputs are stably ordered by logical identity. The AI overlay
is explicitly excluded from this guarantee and is cached separately,
keyed by its bounded inputs.

### Graceful degradation

An unsupported language or unparseable file is marked via ADR-0015's
analysis-status field and skipped — never fatal. A mixed-language or
partially broken repo always produces a graph for the parts that parse.

## Consequences

- Self-hostable by construction: `npm install` with no compiler, one
  `.wasm` per grammar, identical across platforms.
- New-language support is a `lang-*` plugin (grammar `.wasm` + queries +
  subKind mapping per ADR-0015) — no change to the engine, pipeline, or
  core model.
- The ~90% heuristic target keeps the deterministic layer fast, cheap,
  and fully reproducible; the unresolved tail is explicit and is the only
  surface AI ever touches.
- Byte-identical deterministic graphs make the content-hash cache and
  delta-only updates correct.
- The constant-factor WASM parse slowdown affects only the one-time full
  first scan, and is mitigated by per-file parallelism across workers.
  The per-push incremental path reparses only changed files, so
  steady-state latency is unaffected.
- Accepted costs: a constant-factor WASM parse slowdown vs native (first
  scan only, as above); an in-repo, CI-run grammar-build step for
  grammars not yet built; per-SFC multi-grammar composition for
  Vue/Svelte/Angular.

## Alternatives considered

- **Native tree-sitter bindings.** Faster at runtime but fail the
  trivial-self-hosting constraint (node-gyp fallback, regressing prebuild
  coverage), multiplied per grammar.
- **stack-graphs / LSP for resolution.** Rejected above (extensibility
  cost and verifiability; speed and reliability respectively).
- **Sub-file incremental parsing.** Rejected for v1 — needs edit ranges a
  commit diff lacks; no benefit over file-level reparse here.
- **Depending on a third-party prebuilt-WASM pack at runtime, or building
  grammars on install.** Both rejected in favor of CI-built, vendored
  `.wasm` from pinned sources — reproducible provenance and build-free
  installation.

## Amendment — 2026-06-10 (C11): the unresolved tail is persisted

This ADR originally framed the Resolve pass's diagnostics — the honest
unresolved/ambiguous tail — as pipeline-only, "deliberately NOT part of the
persisted graph model". That is **amended additively** (supersedes nothing): the
tail is now **persisted** as a first-class, project-scoped sibling of the graph.
The core gains an `UnresolvedReference` (the failure code, the importer file, the
specifier, and — for an `*-export` gap, where the module resolved but the export
did not — the resolved target file and the unbound name). The worker persists it
in the SAME transaction as the graph (ADR-0025 full-replace), via
`GraphRepository.unresolvedReferences` (ADR-0020 amendment).

It is **not** a graph node or edge: fabricating an edge for an unbindable usage
would assert a dependency we cannot prove (the trust principle). Its purpose is
honesty — `unresolvedReferences(scope, { targetFileId })` answers "does this file
have an unresolved inbound usage?", so the forthcoming deterministic
"unused"/"cycle" views never mistake a resolution gap for genuine absence (the
cardinal false positive). Determinism holds: the tail is totally ordered and
stored-once by identity.

A companion tightening (C10) closes a related gap on the read side: a member call
on a value namespace import (`import * as NS; NS.foo`) now resolves to the
module's exported `foo` through the export chain, so that usage is a real edge
rather than a silent drop.

## Related ADRs

- ADR-0015 (universal code-graph model — node/edge taxonomy, stable
  identity, `deterministic | inferred`, analysis-status, content hash)
- ADR-0004 (build-distributed shared packages — `lang-*` plugins and the
  engine are such packages)
- ADR-0012 (database — storage of the produced graph; storage-agnostic
  here, to be superseded by the storage-interface ADR)
- ADR-0020 (Serve — the `unresolvedReferences` read primitive over the persisted tail)
