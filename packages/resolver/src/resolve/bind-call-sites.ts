import type { Edge, FileNode, SymbolId } from '@toopo/core';
import type {
  NamespaceImports,
  ResolvedImport,
  ResolverPlugin,
  UnresolvedUsage,
} from '../plugin/resolver-plugin.js';
import type { SymbolGraph } from '../project/symbol-graph.js';
import { type Diagnostic, diagnostic } from './diagnostics.js';
import { mintEdge } from './mint.js';

/** The cross-file products of binding one file's deferred call-sites: the minted
 * edges plus the honest tail of unresolved member usages (ADR-0016 C11). */
export interface CallSiteResolution {
  readonly edges: Edge[];
  readonly diagnostics: Diagnostic[];
}

/**
 * Re-emit the cross-file edges the parser deferred for one file (ADR-0016): for
 * each of the file's call-sites the parser left unbound, ask the plugin to bind
 * it against the file's resolved imports — value imports plus namespace imports
 * (for `NS.member` access). The plugin returns descriptors (target `calls`/render
 * edge, payload→prop `references`) AND the member usages it could not bind; the
 * engine mints the former (never upgrading their certainty) and records the latter
 * as honest gaps (C11) — never a fabricated edge. Call-sites the parser already
 * bound in-file are skipped, so a binding is never duplicated.
 */
export function bindFileCallSites(
  file: FileNode,
  plugin: ResolverPlugin,
  resolvedImports: ReadonlyMap<string, ResolvedImport>,
  namespaceImports: NamespaceImports,
  symbolGraph: SymbolGraph,
): CallSiteResolution {
  if (resolvedImports.size === 0 && namespaceImports.size === 0) {
    return { edges: [], diagnostics: [] };
  }
  const edges: Edge[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const callSite of symbolGraph.callSitesOfFile(file.id)) {
    if (symbolGraph.isBound(callSite.id)) {
      continue;
    }
    const result = plugin.bindCallSite(
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
    for (const descriptor of result.edges) {
      edges.push(mintEdge(descriptor));
    }
    for (const usage of result.unresolved) {
      diagnostics.push(usageDiagnostic(file.id, usage, symbolGraph));
    }
  }
  return { edges, diagnostics };
}

/**
 * Map one unresolved member usage to a persisted diagnostic (ADR-0016 C11). The
 * engine resolves the plugin's `rootSymbolId` to the file it lives in (`fileOf`):
 * present ⇒ an ANCHORED `unresolved-member` gap (`targetFileId` + member `name`),
 * so a later "unused" view can exonerate precisely; absent ⇒ an ANCHORLESS
 * `unbound-callee` gap recorded by member name alone (a lost root type). `specifier`
 * is the callee as written — the reference's source token and its identity key.
 */
function usageDiagnostic(
  importerFileId: SymbolId,
  usage: UnresolvedUsage,
  symbolGraph: SymbolGraph,
): Diagnostic {
  const targetFileId =
    usage.rootSymbolId === undefined ? undefined : symbolGraph.fileOf(usage.rootSymbolId);
  if (targetFileId !== undefined) {
    return diagnostic(
      'unresolved-member',
      importerFileId,
      usage.callee,
      `Unresolved member "${usage.member}" on "${usage.callee}"`,
      { targetFileId, name: usage.member },
    );
  }
  return diagnostic(
    'unbound-callee',
    importerFileId,
    usage.callee,
    `Unbound callee root for member "${usage.member}" on "${usage.callee}"`,
    { name: usage.member },
  );
}
