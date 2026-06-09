import type { ExtractContext, GraphFragment } from '@toopo/parser';
import { extractExports } from './exports.js';
import { extractImports } from './imports.js';
import { extractInvocations } from './invocations.js';
import { extractSymbols } from './symbols.js';

/**
 * Map one parsed `.tsx` file to a `@toopo/core` graph fragment (ADR-0016). The
 * orchestration stays thin: each concern is its own pure module.
 *
 *   - symbols/params (Phase C): components/hooks/functions and their declared
 *     interface, with `contains` edges;
 *   - imports: external bindings as deterministic `imports` edges, relative/
 *     alias imports as structured `unresolved` data for the resolver;
 *   - invocations: intra-file `callSite` nodes (calls and JSX renders) with
 *     their payloads, `calls`/`react:renders` edges, and `references` bindings
 *     only where the callee/receiver is lexically resolvable here.
 *
 * The fragment is a pure function of the tree; the parser canonically orders it
 * for byte-identical determinism.
 */
export function extractReact(ctx: ExtractContext): GraphFragment {
  const symbolResult = extractSymbols(ctx);
  const importResult = extractImports(ctx);
  const exportResult = extractExports(ctx, symbolResult.symbols);
  const invocationResult = extractInvocations(
    ctx,
    symbolResult.symbols,
    importResult.externalBindings,
  );

  return {
    nodes: [...symbolResult.nodes, ...invocationResult.nodes],
    edges: [
      ...symbolResult.edges,
      ...importResult.edges,
      ...exportResult.edges,
      ...invocationResult.edges,
    ],
    unresolved: importResult.unresolved,
    exports: exportResult.exports,
    reExports: exportResult.reExports,
  };
}
