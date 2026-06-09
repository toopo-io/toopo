# Vendored grammar provenance

`tsx.wasm` and `typescript.wasm` are **compiled WebAssembly grammars**, not
opaque blobs. Each is reproducible from a pinned source revision with a pinned
toolchain (ADR-0016: self-built WASM behind the `lang-*` interface), and they
ship vendored so a plain `pnpm install` never compiles a grammar.

Two grammars are vendored because `tree-sitter-typescript` ships two: `tsx`
parses JSX, while `typescript` parses `.ts` — the `tsx` grammar misparses `.ts`
type assertions (`<T>x`) as JSX, so the `.ts`/`.tsx` split is required (Part 1).
Both build from the same pinned source and CLI.

## `tsx.wasm`

| Field | Value |
| --- | --- |
| Grammar source | `tree-sitter-typescript` — the `tsx/` grammar |
| Pinned source version | `0.23.2` (this package's devDependency; locked in `pnpm-lock.yaml`) |
| Build tool | `tree-sitter-cli` |
| Pinned tool version | `0.26.9` (ABI-matched to `web-tree-sitter@0.26.9`) |
| Toolchain | `wasi-sdk`, auto-downloaded by the CLI — no native compiler, no Docker required |
| Build command | `pnpm --filter @toopo/lang-react build:grammar` |

## `typescript.wasm`

| Field | Value |
| --- | --- |
| Grammar source | `tree-sitter-typescript` — the `typescript/` grammar |
| Pinned source version | `0.23.2` (this package's devDependency; locked in `pnpm-lock.yaml`) |
| Build tool | `tree-sitter-cli` |
| Pinned tool version | `0.26.9` (ABI-matched to `web-tree-sitter@0.26.9`) |
| Toolchain | `wasi-sdk`, auto-downloaded by the CLI — no native compiler, no Docker required |
| Build command | `pnpm --filter @toopo/lang-react build:grammar` (builds both) |

## Reproduce

```sh
pnpm --filter @toopo/lang-react build:grammar
```

This runs [`../scripts/build-grammar.mjs`](../scripts/build-grammar.mjs), which
resolves the pinned `tree-sitter-typescript/tsx` and `typescript` sources and
the pinned `tree-sitter-cli`, then runs `tree-sitter build --wasm` to regenerate
both files.

## ABI note

The CLI version is deliberately aligned with the runtime `web-tree-sitter`
version (both `0.26.x`) so the produced module's language ABI loads without
error. Prebuilt third-party packs (e.g. `tree-sitter-wasms`) are **not** used:
their modules were built against an older ABI and fail `Language.load` under
`web-tree-sitter@0.26.9`. ADR-0016 permits such packs only to *seed* a build,
never as a runtime dependency; here they are not used at all.
