import {
  type CallSiteNode,
  type Edge,
  isCallSiteNode,
  isSymbolNode,
  type Node,
  type SymbolId,
} from '@toopo/core';
import type { DeclaredChildView, SymbolView } from '../plugin/resolver-plugin.js';

/**
 * Engine-built read models over the aggregated graph, used to bind deferred
 * call-sites across files (ADR-0016). Everything here is derived from the
 * universal `contains` hierarchy and node kinds — never from a language's
 * subKind strings — so the engine stays agnostic; the plugin alone interprets
 * subKinds.
 */
export interface SymbolGraph {
  readonly symbolView: SymbolView;
  /** Call-sites whose enclosing symbol is a top-level symbol of the given file. */
  callSitesOfFile(fileId: SymbolId): readonly CallSiteNode[];
  /** Whether a call-site already has a `calls` edge (parse bound it in-file). */
  isBound(callSiteId: SymbolId): boolean;
}

export function buildSymbolGraph(nodes: readonly Node[], edges: readonly Edge[]): SymbolGraph {
  const nodeById = new Map<SymbolId, Node>();
  for (const node of nodes) {
    nodeById.set(node.id, node);
  }

  const fileOfSymbol = new Map<SymbolId, SymbolId>();
  const childrenOfSymbol = new Map<SymbolId, DeclaredChildView[]>();
  const boundCallSites = new Set<SymbolId>();
  for (const edge of edges) {
    if (edge.kind === 'calls') {
      boundCallSites.add(edge.sourceId);
      continue;
    }
    if (edge.kind !== 'contains') {
      continue;
    }
    const source = nodeById.get(edge.sourceId);
    const target = nodeById.get(edge.targetId);
    if (target === undefined || !isSymbolNode(target)) {
      continue;
    }
    if (source?.kind === 'file') {
      fileOfSymbol.set(target.id, source.id);
    } else if (source?.kind === 'symbol') {
      appendChild(childrenOfSymbol, source.id, {
        id: target.id,
        name: target.name,
        subKind: target.subKind,
      });
    }
  }

  const callSitesByFile = new Map<SymbolId, CallSiteNode[]>();
  for (const node of nodes) {
    if (!isCallSiteNode(node)) {
      continue;
    }
    const fileId = fileOfSymbol.get(node.enclosingSymbolId);
    if (fileId !== undefined) {
      appendCallSite(callSitesByFile, fileId, node);
    }
  }

  return {
    symbolView: { declaredChildren: (id) => childrenOfSymbol.get(id) ?? [] },
    callSitesOfFile: (fileId) => callSitesByFile.get(fileId) ?? [],
    isBound: (callSiteId) => boundCallSites.has(callSiteId),
  };
}

function appendChild(
  map: Map<SymbolId, DeclaredChildView[]>,
  symbolId: SymbolId,
  child: DeclaredChildView,
): void {
  const existing = map.get(symbolId);
  if (existing === undefined) {
    map.set(symbolId, [child]);
  } else {
    existing.push(child);
  }
}

function appendCallSite(
  map: Map<SymbolId, CallSiteNode[]>,
  fileId: SymbolId,
  callSite: CallSiteNode,
): void {
  const existing = map.get(fileId);
  if (existing === undefined) {
    map.set(fileId, [callSite]);
  } else {
    existing.push(callSite);
  }
}
