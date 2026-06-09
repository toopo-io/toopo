import {
  type Edge,
  type FileNode,
  formatSymbolId,
  type PackageCoordinate,
  type SymbolId,
} from '@toopo/core';
import type { ImportedBinding, ParseResult, UnresolvedImport } from '@toopo/parser';
import type {
  ExportIndex,
  ModuleIndex,
  ModuleResolution,
  ProjectModel,
  ResolvedImport,
  ResolverPlugin,
} from '../plugin/resolver-plugin.js';
import { type Diagnostic, diagnostic } from './diagnostics.js';
import { type ExportChainResult, resolveExportChain } from './export-chain.js';
import { buildResolveEdge, combineCertainty } from './mint.js';

/** The outcome of resolving one file's imports: the new edges, the local-name →
 * symbol map the call-site binder consumes, and the honest tail of diagnostics. */
export interface ImportResolution {
  readonly edges: Edge[];
  readonly resolvedImports: Map<string, ResolvedImport>;
  readonly diagnostics: Diagnostic[];
}

/**
 * Resolve every relative/alias import the parser deferred for one file (ADR-0016
 * Resolve pass). For each statement the plugin resolves the module specifier to a
 * file, then each binding's exported name to a symbol — following barrel chains.
 * The engine mints the `imports` edge and records the binding. Per the
 * no-silent-omission rule, an import whose module resolves to a known file but
 * whose symbols cannot be bound (a namespace/type binding, or a missing/ambiguous
 * export) still gets a module-level dependency edge — a real dependency is never
 * dropped.
 */
export function bindFileImports(
  fragment: ParseResult,
  file: FileNode,
  plugin: ResolverPlugin,
  moduleIndex: ModuleIndex,
  exportIndex: ExportIndex,
  project: ProjectModel,
): ImportResolution {
  const sink: ImportResolution = { edges: [], resolvedImports: new Map(), diagnostics: [] };

  for (const unresolved of fragment.unresolved) {
    const moduleResolution = plugin.resolveModule(
      {
        specifier: unresolved.specifier,
        importerPath: file.path,
        importerFileId: file.id,
        typeOnly: unresolved.typeOnly,
      },
      moduleIndex,
      project,
    );
    bindStatement(
      unresolved,
      file,
      moduleResolution,
      plugin,
      moduleIndex,
      exportIndex,
      project,
      sink,
    );
  }

  return sink;
}

function bindStatement(
  unresolved: UnresolvedImport,
  file: FileNode,
  moduleResolution: ModuleResolution,
  plugin: ResolverPlugin,
  moduleIndex: ModuleIndex,
  exportIndex: ExportIndex,
  project: ProjectModel,
  sink: ImportResolution,
): void {
  if (moduleResolution.status === 'unresolved') {
    // No known file at all → diagnostic only, no fabricated edge (ADR-0016).
    sink.diagnostics.push(
      diagnostic('unresolved-module', file.id, unresolved.specifier, moduleResolution.reason),
    );
    return;
  }
  if (moduleResolution.status === 'ambiguous') {
    sink.diagnostics.push(
      diagnostic(
        'ambiguous-module',
        file.id,
        unresolved.specifier,
        `Ambiguous module: ${moduleResolution.candidates.join(', ')}`,
      ),
    );
    return;
  }
  if (moduleResolution.status === 'external') {
    // A relative/alias specifier landing on an external package has no internal
    // symbol target; later slices model the external coordinate. Nothing to bind.
    return;
  }

  const targetFileId = moduleResolution.fileId;
  let boundSymbol = false;
  for (const binding of unresolved.imported) {
    if (binding.kind === 'namespace' || binding.typeOnly) {
      // A namespace/type binding is a real dependency but binds no value symbol
      // here; the module-level edge below records the dependency.
      continue;
    }
    boundSymbol =
      bindNamedImport(
        unresolved,
        file,
        targetFileId,
        binding,
        moduleResolution,
        plugin,
        moduleIndex,
        exportIndex,
        project,
        sink,
      ) || boundSymbol;
  }

  if (!boundSymbol) {
    // No precise symbol edge was emitted for this statement, yet the module is a
    // real dependency (namespace/type import, or every name failed) — record it.
    sink.edges.push(
      buildResolveEdge(
        'imports',
        file.id,
        targetFileId,
        'resolve/import-module',
        moduleResolution.certainty,
      ),
    );
  }
}

/** Resolve one named/default binding through the export chain; returns whether it
 * produced a precise symbol (or external) edge — `false` falls back to the
 * module-level dependency edge. */
function bindNamedImport(
  unresolved: UnresolvedImport,
  file: FileNode,
  targetFileId: SymbolId,
  binding: ImportedBinding,
  moduleResolution: Extract<ModuleResolution, { status: 'internal' }>,
  plugin: ResolverPlugin,
  moduleIndex: ModuleIndex,
  exportIndex: ExportIndex,
  project: ProjectModel,
  sink: ImportResolution,
): boolean {
  const chain = resolveExportChain(
    { fileId: targetFileId, exportedName: binding.name, typeOnly: binding.typeOnly },
    plugin,
    moduleIndex,
    exportIndex,
    project,
  );

  if (chain.status === 'symbol') {
    const certainty = combineCertainty(moduleResolution.certainty, chain.certainty);
    bindResolved(file, binding, chain.symbolId, certainty, 'resolve/import', sink);
    return true;
  }
  if (chain.status === 'external') {
    // A barrel re-exports the name from a package — the importer depends on that
    // external symbol (no node, mirroring the parser's external imports).
    bindResolved(
      file,
      binding,
      externalSymbolId(chain.coordinate, chain.name),
      { resolution: 'deterministic' },
      'resolve/import-external',
      sink,
    );
    return true;
  }

  sink.diagnostics.push(
    diagnostic(
      chain.status === 'ambiguous' ? 'ambiguous-export' : 'unresolved-export',
      file.id,
      unresolved.specifier,
      chainReason(chain, binding.name),
    ),
  );
  return false;
}

function bindResolved(
  file: FileNode,
  binding: ImportedBinding,
  symbolId: SymbolId,
  certainty: ResolvedImport['certainty'],
  rule: string,
  sink: ImportResolution,
): void {
  sink.edges.push(buildResolveEdge('imports', file.id, symbolId, rule, certainty));
  sink.resolvedImports.set(binding.localName, { symbolId, certainty });
}

/** The id of an external symbol identified by its package coordinate and name. */
function externalSymbolId(coordinate: PackageCoordinate, name: string): SymbolId {
  return formatSymbolId({ package: coordinate, descriptors: [{ name, suffix: 'term' }] });
}

function chainReason(
  chain: Extract<ExportChainResult, { status: 'unresolved' | 'ambiguous' }>,
  exportedName: string,
): string {
  if (chain.status === 'unresolved') {
    return chain.reason;
  }
  return `Ambiguous export "${exportedName}": ${chain.candidates.join(', ')}`;
}
