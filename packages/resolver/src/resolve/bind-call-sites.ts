import type { Edge, FileNode } from '@toopo/core';
import type {
  NamespaceImports,
  ResolvedImport,
  ResolverPlugin,
} from '../plugin/resolver-plugin.js';
import type { SymbolGraph } from '../project/symbol-graph.js';
import { mintEdge } from './mint.js';

/**
 * Re-emit the cross-file edges the parser deferred for one file (ADR-0016): for
 * each of the file's call-sites the parser left unbound, ask the plugin to bind
 * it against the file's resolved imports — value imports plus namespace imports
 * (for `NS.member` access). The plugin returns descriptors (target `calls`/render
 * edge, payload→prop `references`); the engine mints them and never upgrades
 * their certainty. Call-sites the parser already bound in-file are skipped, so a
 * binding is never duplicated.
 */
export function bindFileCallSites(
  file: FileNode,
  plugin: ResolverPlugin,
  resolvedImports: ReadonlyMap<string, ResolvedImport>,
  namespaceImports: NamespaceImports,
  symbolGraph: SymbolGraph,
): Edge[] {
  if (resolvedImports.size === 0 && namespaceImports.size === 0) {
    return [];
  }
  const edges: Edge[] = [];
  for (const callSite of symbolGraph.callSitesOfFile(file.id)) {
    if (symbolGraph.isBound(callSite.id)) {
      continue;
    }
    const descriptors = plugin.bindCallSite(
      {
        callSiteId: callSite.id,
        callee: callSite.callee,
        subKind: callSite.subKind,
        payload: callSite.payload,
      },
      resolvedImports,
      namespaceImports,
      symbolGraph.symbolView,
    );
    for (const descriptor of descriptors) {
      edges.push(mintEdge(descriptor));
    }
  }
  return edges;
}
