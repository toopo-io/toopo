# ADR 0027: Local-symbol identity — the `local` descriptor suffix

Date: 2026-06-10
Status: Accepted

Extends ADR-0015 (the universal code-graph model — this adds one descriptor
suffix, an additive, non-breaking change permitted by §5) and ADR-0016 (parsing
grain — this lets the extractor descend below file-contained symbols into
nested, in-body declarations). Supersedes nothing; edits no prior decision.

## Context

The cartography target is "click a symbol → its functions, its variables." Until
now the finest grain the extractor reached was the file-contained symbol plus its
declared parameters/props (ADR-0015 §6). Two declaration classes were therefore
invisible: **nested functions** (a `function`/arrow declared inside another
function's body) and **local variables** (a `const`/`let`/`var`, including
destructured bindings, inside a body). Both are genuine *declarations*, not
arbitrary AST nodes, so capturing them stays within ADR-0015 §3's grain rule
(declarations become `symbol` nodes; statements/expressions never do).

What blocked them was identity, not the grain. A symbol's id is a SCIP-style
descriptor path, never line/column (ADR-0015 §4). The eight SCIP descriptor
suffixes (`namespace`, `type`, `term`, `method`, `type-parameter`, `parameter`,
`meta`, `macro`) have no member for an in-scope binding, because SCIP models a
local as a separate symbol form — `local <id>`, a per-document counter. That form
is **not edit-stable**: inserting a local renumbers every later one, so a local's
id would churn on edits unrelated to it, breaking cross-commit tracking and the
determinism guarantee's usefulness.

Toopo needs local ids that are (a) most-correct, (b) edit-stable (line/column
independent), (c) shadowing/scope-safe, and (d) faithful to SCIP's descriptor
*model*.

## Decision

1. **Add a `local` descriptor suffix** to the closed `DESCRIPTOR_SUFFIXES` set.
   An in-body named binding — a nested function or a local variable — is
   identified by a descriptor path that walks the **enclosing named scopes** and
   ends in a `local` segment, e.g. a local `total` inside top-level `outer` is
   `outer.total~~`; a parameter of a nested function `inner` is
   `outer.inner~~(z)`. This is edit-stable (it is a function of names and nesting,
   never of position) and scope-safe (the enclosing-scope path disambiguates two
   same-named locals in different functions).

2. **Disambiguate genuine shadows by declaration order.** Two bindings that share
   a name *and* the same enclosing named scope (sibling-block shadows, redeclared
   `var`) are separated by a numeric `disambiguator` assigned in source order —
   reusing the exact mechanism `method` already uses for overloads (ADR-0015 §4).
   A uniquely-named binding carries no disambiguator, so its id is fully stable;
   only the rare shadow pays the order-sensitivity, which is intrinsic to symbols
   that are otherwise indistinguishable (SCIP's `local <id>` is order-sensitive
   for the same reason).

3. **Encoding.** A `local` descriptor encodes as `name~<disambiguator>~` (the
   disambiguator empty when absent, giving the doubled-tilde `name~~`). `~` is
   outside the simple-identifier set, so it is unambiguous with names (a name
   containing `~` is backtick-escaped, as for every other suffix); the form is
   self-delimiting and round-trips through the codec.

4. **Scope of `local`.** It marks only in-*body* bindings. A module-level
   destructured binding (`const { a, b } = x` at file scope) is a top-level symbol
   with a unique public name and keeps the `term` suffix — it needs no `local`
   segment and no disambiguation.

## Consequences

- **Non-breaking (ADR-0015 §5).** Existing ids never use `local`, so they encode
  and decode unchanged; only new local ids carry the new suffix. The suffix set
  stays closed and ratified.
- **Determinism preserved.** Local ids are a pure function of names + nesting +
  source order; the canonical comparator already orders by id string, so the
  graph stays byte-identical per commit.
- **Trust preserved.** A binding with no stable public identity (a computed key,
  a deeply nested array element) is skipped, never fabricated.
- **Graph size.** Capturing every local materially increases node count. The
  default cartography views never traverse below a file's top-level symbols, so
  locals are loaded only on demand (the detail/declared-interface reads), making
  them naturally lazy at the query layer; see the R1 measurement recorded with
  the implementing change for the eager-vs-gated decision.
- **SCIP fidelity.** Toopo diverges from SCIP's literal `local <id>` syntax but
  keeps its descriptor *philosophy* — structured, role-tagged path segments with
  an order disambiguator for collisions — trading SCIP's document-local opacity
  for the edit-stability Toopo's cross-commit graph requires.
