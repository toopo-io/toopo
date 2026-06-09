import type { LanguagePlugin } from '@toopo/parser';
import { extractReact } from './extract/extract.js';
import { loadTsxGrammar } from './grammar/load.js';

/** Stable cache key for the vendored TSX grammar in the parser's grammar cache. */
const GRAMMAR_ID = 'react-tsx';

/**
 * The React/TypeScript language plugin (ADR-0016) — the first real
 * implementation of the parser's `LanguagePlugin` interface. It vendors the TSX
 * grammar and, from Phase C, maps tree-sitter captures to `@toopo/core` symbols
 * (components, hooks, functions), their declared params/props, intra-file
 * call-sites, and imports.
 *
 * The slice is `.tsx` only (ADR-0016 Fork 6); `.ts`/`.jsx` and the non-JSX
 * grammar are a later expansion. `extract` maps top-level components, hooks,
 * and functions with their declared params/props and contains edges (Phase C),
 * plus call-sites and imports (Phase D).
 */
export function createReactPlugin(): LanguagePlugin {
  return {
    id: 'react',
    grammar: { id: GRAMMAR_ID, load: loadTsxGrammar },
    matches: (file) => file.path.endsWith('.tsx'),
    extract: extractReact,
  };
}
