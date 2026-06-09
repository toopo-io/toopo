import { readFile } from 'node:fs/promises';

/**
 * Resolve and read the vendored, CI-built TSX grammar (ADR-0016). The `.wasm`
 * lives at the package root under `grammars/` — NOT in `src/` — so it sits at
 * the same `../../grammars/` depth whether this module runs from `src/grammar/`
 * (tests) or `dist/grammar/` (built), and it ships via the package `files`
 * list. The parser loads and caches the returned bytes; this package never
 * imports `web-tree-sitter` to load it.
 */
const TSX_WASM_URL = new URL('../../grammars/tsx.wasm', import.meta.url);

export function loadTsxGrammar(): Promise<Uint8Array> {
  return readFile(TSX_WASM_URL);
}
