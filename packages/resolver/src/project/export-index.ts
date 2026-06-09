import type { SymbolId } from '@toopo/core';
import type { ParseResult, ReExport } from '@toopo/parser';
import type { ExportIndex } from '../plugin/resolver-plugin.js';

const NO_RE_EXPORTS: readonly ReExport[] = [];

/**
 * Build the project's export index (ADR-0016) from the parse-side `LocalExport`
 * and `ReExport` records: a (file, exported name) → defining symbol lookup for
 * direct local exports, plus the file's re-export statements for barrel chains.
 * The local map keys by the precise exported name (`default`, or a rename), so a
 * `default` export is never conflated with a same-named named export; the plugin
 * follows re-exports hop by hop, the engine orchestrating the chain.
 */
export function buildExportIndex(fragments: readonly ParseResult[]): ExportIndex {
  const exportsByFile = new Map<SymbolId, Map<string, SymbolId>>();
  const reExportsByFile = new Map<SymbolId, ReExport[]>();
  for (const fragment of fragments) {
    for (const localExport of fragment.exports) {
      let byName = exportsByFile.get(localExport.exporterFileId);
      if (byName === undefined) {
        byName = new Map<string, SymbolId>();
        exportsByFile.set(localExport.exporterFileId, byName);
      }
      byName.set(localExport.exportedName, localExport.symbolId);
    }
    for (const reExport of fragment.reExports) {
      const existing = reExportsByFile.get(reExport.exporterFileId);
      if (existing === undefined) {
        reExportsByFile.set(reExport.exporterFileId, [reExport]);
      } else {
        existing.push(reExport);
      }
    }
  }
  return {
    localExport: (fileId, exportedName) => exportsByFile.get(fileId)?.get(exportedName),
    reExports: (fileId) => reExportsByFile.get(fileId) ?? NO_RE_EXPORTS,
  };
}
