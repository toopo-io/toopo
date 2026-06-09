import type { PackageCoordinate, SymbolId } from '@toopo/core';
import type {
  Certainty,
  ExportIndex,
  ModuleIndex,
  ProjectModel,
  ResolverPlugin,
} from '../plugin/resolver-plugin.js';
import { combineCertainty } from './mint.js';

/** The terminal outcome of following a (possibly multi-hop) export chain. */
export type ExportChainResult =
  | { readonly status: 'symbol'; readonly symbolId: SymbolId; readonly certainty: Certainty }
  | { readonly status: 'external'; readonly coordinate: PackageCoordinate; readonly name: string }
  | { readonly status: 'ambiguous'; readonly candidates: readonly SymbolId[] }
  | { readonly status: 'unresolved'; readonly reason: string };

/** Where to start resolving an exported name. */
export interface ExportChainStart {
  readonly fileId: SymbolId;
  readonly exportedName: string;
  readonly typeOnly: boolean;
}

/**
 * Resolve an exported name to its defining symbol, following barrel re-export
 * redirects hop by hop (ADR-0016 Fork 3). The engine owns the orchestration —
 * cycle detection (a re-export loop terminates as `unresolved`) and certainty
 * accumulation (each hop is combined, so any `inferred` step, e.g. an `export *`,
 * makes the whole chain `inferred` at the lowest confidence) — while the plugin
 * stays single-hop. The result is never fabricated: an unknown or ambiguous hop
 * ends the chain honestly.
 */
export function resolveExportChain(
  start: ExportChainStart,
  plugin: ResolverPlugin,
  moduleIndex: ModuleIndex,
  exportIndex: ExportIndex,
  project: ProjectModel,
): ExportChainResult {
  const visited = new Set<string>();

  const step = (
    fileId: SymbolId,
    exportedName: string,
    accumulated: Certainty,
  ): ExportChainResult => {
    const key = `${fileId} ${exportedName}`;
    if (visited.has(key)) {
      return { status: 'unresolved', reason: `Re-export cycle resolving "${exportedName}".` };
    }
    visited.add(key);

    const hop = plugin.resolveExport(
      { fileId, exportedName, typeOnly: start.typeOnly },
      exportIndex,
    );
    if (hop.status === 'symbol') {
      return {
        status: 'symbol',
        symbolId: hop.symbolId,
        certainty: combineCertainty(accumulated, hop.certainty),
      };
    }
    if (hop.status === 'external') {
      return { status: 'external', coordinate: hop.coordinate, name: hop.name };
    }
    if (hop.status === 'ambiguous') {
      return { status: 'ambiguous', candidates: hop.candidates };
    }
    if (hop.status === 'unresolved') {
      return { status: 'unresolved', reason: hop.reason };
    }

    // A re-export redirect: resolve its module, then recurse into it.
    const module = plugin.resolveModule(
      {
        specifier: hop.specifier,
        importerPath: hop.importerPath,
        importerFileId: fileId,
        typeOnly: start.typeOnly,
      },
      moduleIndex,
      project,
    );
    if (module.status === 'unresolved') {
      return { status: 'unresolved', reason: module.reason };
    }
    if (module.status === 'ambiguous') {
      return { status: 'ambiguous', candidates: module.candidates };
    }
    if (module.status === 'external') {
      return { status: 'external', coordinate: module.coordinate, name: hop.exportedName };
    }
    const nextCertainty = combineCertainty(
      accumulated,
      combineCertainty(hop.certainty, module.certainty),
    );
    return step(module.fileId, hop.exportedName, nextCertainty);
  };

  return step(start.fileId, start.exportedName, { resolution: 'deterministic' });
}
