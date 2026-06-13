# Why Toopo

The design follows a small set of cardinal principles. They explain why Toopo is built the way it is — and why some easier paths were deliberately not taken.

## Architecture first

The cleanest, most extensible path is taken even when it is harder — no hacks, no "temporary" shortcuts. The cost of that discipline is paid once; the cost of debt is paid forever.

## Trust above all

Toopo detects deterministically wherever it can, and the graph itself is the proof of impact. Certain and uncertain must always be distinguishable — in the data and in the UI. Toopo never asserts "nothing breaks" as a certainty. **One false positive destroys trust**, so the bias is explicit: prefer missing a real issue over crying a false one. This is why unresolved references are recorded honestly rather than fabricated into edges, and why every finding is labelled certain or candidate.

## Determinism

The same commit produces a byte-identical deterministic graph. This is what makes the content-hash cache and delta-only updates correct, and it is why the deterministic layer contains no AI and no nondeterministic ordering. AI, when it comes, is a bounded overlay — never part of the guarantee.

## Graceful degradation

An unsupported language or an unparseable file is marked and skipped, never fatal. A mixed-language repository never crashes the analysis; it produces a graph for the parts that parse.

## Isolate what varies

Language (`lang-*`), the future AI model router, the queue, storage, and deployment each sit behind an interface. The core never changes; only implementations do. This is what lets Toopo grow across languages, models, and load without accumulating debt — a new language is a new package, not a change to the engine.

## Cost-aware, never at the expense of correctness

Prompts, models, and techniques are optimised to cost less — but only when quality is untouched. Determinism is itself the largest cost lever: everything the static layer resolves is something AI never has to.

---

**See also:** [Architecture overview](overview.md) · [What Toopo cannot do](../concepts/what-toopo-cannot-do.md) · [Decision records](../adr/README.md).
