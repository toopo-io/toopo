import { type Edge, formatSymbolId, type SymbolId } from '@toopo/core';
import type { ExternalImport } from '@toopo/parser';
import type {
  Certainty,
  ExportIndex,
  ModuleIndex,
  ProjectModel,
  ResolverPlugin,
  WorkspacePackage,
} from '../plugin/resolver-plugin.js';
import { resolveExportChain } from './export-chain.js';
import { buildResolveEdge } from './mint.js';

/** A reclassification: a provisional external symbol superseded by an internal one. */
export interface WorkspaceSupersede {
  readonly internalId: SymbolId;
  readonly certainty: Certainty;
}

/**
 * Build the map of provisional external symbols to supersede with internal ones
 * (ADR-0016 Fork 2b, Fix C2). The parser cannot know which bare specifiers are
 * workspace packages (it has no project view), so it emits provisional external
 * `imports` edges for ALL of them AND preserves each bare import's subpath as an
 * {@link ExternalImport} record. Holding the workspace map, the resolver
 * re-resolves each record whose package is a workspace member — through the
 * correct SOURCE entry (the package's main entry for a bare import, or the
 * `exports`-map subpath source for `pkg/subpath`) and the export chain — to the
 * real internal symbol. Driving from the records (not the edges) is what lets a
 * subpath import resolve through its own source, not the package root. Only
 * successful, source-backed resolutions supersede; an unknown package/subpath,
 * an unparsed source, or an unfound export is left external (never fabricated).
 */
export function buildWorkspaceSupersede(
  externalImports: readonly ExternalImport[],
  project: ProjectModel,
  plugins: readonly ResolverPlugin[],
  moduleIndex: ModuleIndex,
  exportIndex: ExportIndex,
): Map<SymbolId, WorkspaceSupersede> {
  const supersede = new Map<SymbolId, WorkspaceSupersede>();
  if (project.workspacePackages.length === 0) {
    return supersede;
  }
  const byName = new Map(project.workspacePackages.map((pkg) => [pkg.name, pkg]));

  for (const record of externalImports) {
    const pkg = byName.get(record.packageName);
    const entry = pkg === undefined ? undefined : sourceEntryFor(pkg, record.subpath);
    if (entry === undefined) {
      continue;
    }
    const entryFileId = moduleIndex.fileId(entry);
    const plugin = plugins.find((candidate) => candidate.matches({ path: entry }));
    if (entryFileId === undefined || plugin === undefined) {
      continue;
    }
    for (const binding of record.imported) {
      if (binding.kind === 'namespace') {
        continue; // namespace imports declare no single external symbol (parse parity)
      }
      const targetId = externalSymbolId(record.packageName, binding.name);
      if (supersede.has(targetId)) {
        continue;
      }
      const chain = resolveExportChain(
        { fileId: entryFileId, exportedName: binding.name, typeOnly: false },
        plugin,
        moduleIndex,
        exportIndex,
        project,
      );
      if (chain.status === 'symbol') {
        supersede.set(targetId, { internalId: chain.symbolId, certainty: chain.certainty });
      }
    }
  }
  return supersede;
}

/** The source file backing a bare import (main `entry`) or a `pkg/subpath` import. */
function sourceEntryFor(pkg: WorkspacePackage, subpath: string): string | undefined {
  if (subpath === '') {
    return pkg.entry;
  }
  return pkg.subpathExports?.find((exported) => exported.subpath === subpath)?.entry;
}

/** Reconstruct the provisional external symbol id the parser emitted for a binding. */
function externalSymbolId(packageName: string, name: string): SymbolId {
  return formatSymbolId({
    package: { manager: 'npm', name: packageName },
    descriptors: [{ name, suffix: 'term' }],
  });
}

/**
 * Rewrite every edge that targets a superseded external symbol to point at its
 * internal symbol instead (ADR-0016 Fork 2b). The retarget is generic — a pure
 * target-id rewrite over the universal edge — so the engine needs no language
 * knowledge: the import edge, and any call/render edge the parser bound to the
 * external coordinate, all follow to the internal symbol, carrying the
 * reclassification's certainty under a `resolve` provenance.
 */
export function applyWorkspaceSupersede(
  edges: readonly Edge[],
  supersede: ReadonlyMap<SymbolId, WorkspaceSupersede>,
): Edge[] {
  if (supersede.size === 0) {
    return [...edges];
  }
  return edges.map((edge) => {
    const target = supersede.get(edge.targetId);
    if (target === undefined) {
      return edge;
    }
    return buildResolveEdge(
      edge.kind,
      edge.sourceId,
      target.internalId,
      'resolve/workspace',
      target.certainty,
      edge.subKind,
    );
  });
}
