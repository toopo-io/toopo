import { readFile } from 'node:fs/promises';

/**
 * Resolve and read the vendored, CI-built grammars (ADR-0016). Each `.wasm`
 * lives at the package root under `grammars/` — NOT in `src/` — so it sits at
 * the same `../../grammars/` depth whether this module runs from `src/grammar/`
 * (tests) or `dist/grammar/` (built), and it ships via the package `files`
 * list. The parser loads and caches the returned bytes; this package never
 * imports `web-tree-sitter` to load it.
 *
 * Two grammars are vendored: `tsx` for `.tsx` (JSX) and `typescript` for `.ts`.
 * The split is required — the `tsx` grammar misparses `.ts` type assertions
 * (`<T>x`) as JSX — so each file extension loads its matching grammar (Part 1).
 */
const TSX_WASM_URL = new URL('../../grammars/tsx.wasm', import.meta.url);
const TYPESCRIPT_WASM_URL = new URL('../../grammars/typescript.wasm', import.meta.url);

export function loadTsxGrammar(): Promise<Uint8Array> {
  return readFile(TSX_WASM_URL);
}

export function loadTypescriptGrammar(): Promise<Uint8Array> {
  return readFile(TYPESCRIPT_WASM_URL);
}
