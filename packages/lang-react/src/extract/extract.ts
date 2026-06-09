import type { ExtractContext, GraphFragment } from '@toopo/parser';
import { extractExports } from './exports.js';
import { bindHeritageEdges } from './heritage-edges.js';
import { extractImports } from './imports.js';
import { extractInvocations } from './invocations.js';
import { extractSymbols } from './symbols.js';

/**
 * Per-grammar extraction options. `jsx` is false for the `.ts` variant, whose
 * grammar has no JSX node types: compiling a JSX query against it throws
 * (`Bad node name 'jsx_element'`), so the JSX passes must be skipped entirely.
 * This is also semantically correct — a `.ts` file has no JSX, so a Capitalized
 * function is just a function, never a component (Part 1).
 */
export interface ExtractOptions {
  readonly jsx: boolean;
}

/**
 * Map one parsed TypeScript file to a `@toopo/core` graph fragment (ADR-0016).
 * The orchestration stays thin: each concern is its own pure module.
 *
 *   - symbols/params: top-level functions, components, hooks, value variables,
 *     classes, interfaces, and type aliases (Fix B) plus function-like declared
 *     params/props, with `contains` edges;
 *   - imports: external bindings as deterministic `imports` edges, relative/
 *     alias imports as structured `unresolved` data for the resolver;
 *   - invocations: intra-file `callSite` nodes (calls and, in `.tsx`, JSX
 *     renders) with their payloads, `calls`/`react:renders` edges, and
 *     `references` bindings only where the callee/receiver is lexically
 *     resolvable here;
 *   - heritage: class `extends`/`implements` edges to in-file or imported-
 *     external supertypes (Fix B).
 *
 * `options.jsx` gates every JSX pass: the `.ts` grammar lacks JSX node types,
 * so those passes are skipped (and would otherwise throw at query compilation).
 *
 * The fragment is a pure function of the tree; the parser canonically orders it
 * for byte-identical determinism.
 */
export function extractReact(ctx: ExtractContext, options: ExtractOptions): GraphFragment {
  const symbolResult = extractSymbols(ctx, options.jsx);
  const importResult = extractImports(ctx);
  const exportResult = extractExports(ctx, symbolResult.symbols);
  const invocationResult = extractInvocations(
    ctx,
    symbolResult.symbols,
    importResult.externalBindings,
    options.jsx,
  );
  const heritageEdges = bindHeritageEdges(symbolResult.symbols, importResult.externalBindings);

  return {
    nodes: [...symbolResult.nodes, ...invocationResult.nodes],
    edges: [
      ...symbolResult.edges,
      ...importResult.edges,
      ...exportResult.edges,
      ...invocationResult.edges,
      ...heritageEdges,
    ],
    unresolved: importResult.unresolved,
    exports: exportResult.exports,
    reExports: exportResult.reExports,
  };
}
