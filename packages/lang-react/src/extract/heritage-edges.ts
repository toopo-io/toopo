import type { Edge, EdgeKind, SymbolId } from '@toopo/core';
import { parseEdge } from './edges.js';
import type { ExtractedSymbol } from './symbols.js';

/**
 * Bind class supertype names to `extends`/`implements` edges (Fix B). A
 * supertype resolves only when it is lexically knowable in this file — a
 * same-file symbol, or a bare-imported external binding (mirroring how
 * call-site targets are bound). A relative-imported supertype gets NO fabricated
 * edge: cross-file extends/implements correlation is a later Resolve-pass
 * concern, and the trust principle forbids guessing a target here.
 */
export function bindHeritageEdges(
  symbols: readonly ExtractedSymbol[],
  externalBindings: ReadonlyMap<string, SymbolId>,
): Edge[] {
  const symbolByName = new Map(symbols.map((symbol) => [symbol.name, symbol.id]));
  const edges: Edge[] = [];
  for (const symbol of symbols) {
    for (const name of symbol.heritage.extends) {
      append(edges, 'extends', symbol.id, name, symbolByName, externalBindings);
    }
    for (const name of symbol.heritage.implements) {
      append(edges, 'implements', symbol.id, name, symbolByName, externalBindings);
    }
  }
  return edges;
}

function append(
  edges: Edge[],
  kind: EdgeKind,
  sourceId: SymbolId,
  name: string,
  symbolByName: ReadonlyMap<string, SymbolId>,
  externalBindings: ReadonlyMap<string, SymbolId>,
): void {
  const external = externalBindings.get(name);
  if (external !== undefined) {
    edges.push(parseEdge(kind, sourceId, external, `react/${kind}-external`));
    return;
  }
  const local = symbolByName.get(name);
  if (local !== undefined) {
    edges.push(parseEdge(kind, sourceId, local, `react/${kind}-local`));
  }
}
