import type { ExtractContext, GraphFragment, LanguagePlugin } from '@toopo/parser';
import { extractReact } from './extract/extract.js';
import { loadTsxGrammar, loadTypescriptGrammar } from './grammar/load.js';

/** Stable cache keys for the vendored grammars in the parser's grammar cache. */
const TSX_GRAMMAR_ID = 'react-tsx';
const TYPESCRIPT_GRAMMAR_ID = 'react-typescript';

/**
 * The React/TypeScript language plugins (ADR-0016) — the first real
 * implementation of the parser's `LanguagePlugin` interface. They map
 * tree-sitter captures to `@toopo/core` symbols (components, hooks, functions),
 * their declared params/props, intra-file call-sites, and imports.
 *
 * Two plugins share one extractor because `tree-sitter-typescript` ships two
 * grammars and the `.tsx` grammar misparses `.ts` type assertions (`<T>x`) as
 * JSX (Part 1). Each variant binds its matching grammar and toggles the JSX
 * passes accordingly — `.tsx` with JSX on, `.ts` with JSX off (its grammar has
 * no JSX node types, so those queries would not even compile). The parser
 * resolves the right plugin per file by extension and caches each grammar by
 * its distinct id.
 *
 * The slice is `.ts` + `.tsx` (ADR-0016 Fork 6); `.js`/`.jsx`/`.mjs`/`.cjs` are
 * a later expansion.
 */
export function createReactPlugins(): LanguagePlugin[] {
  return [
    {
      id: 'react',
      grammar: { id: TSX_GRAMMAR_ID, load: loadTsxGrammar },
      matches: (file) => file.path.endsWith('.tsx'),
      extract: (ctx: ExtractContext): GraphFragment => extractReact(ctx, { jsx: true }),
    },
    {
      id: 'react',
      grammar: { id: TYPESCRIPT_GRAMMAR_ID, load: loadTypescriptGrammar },
      matches: (file) => file.path.endsWith('.ts'),
      extract: (ctx: ExtractContext): GraphFragment => extractReact(ctx, { jsx: false }),
    },
  ];
}
