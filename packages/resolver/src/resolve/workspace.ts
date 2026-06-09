import { type Edge, parseSymbolId, type SymbolId } from '@toopo/core';
import type {
  Certainty,
  ExportIndex,
  ModuleIndex,
  ProjectModel,
  ResolverPlugin,
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
 * (ADR-0016 Fork 2b). The parser cannot know which bare specifiers are workspace
 * packages (it has no project view), so it emits provisional external `imports`
 * edges for ALL of them. Holding the workspace map, the resolver re-resolves each
 * bare import whose package is a workspace member — through that package's entry
 * file and the export chain — to the real internal symbol. Only successful,
 * entry-backed resolutions supersede; an unknown package, an unparsed entry, or
 * an unfound export is left external (honest, never fabricated).
 */
export function buildWorkspaceSupersede(
  edges: readonly Edge[],
  project: ProjectModel,
  plugins: readonly ResolverPlugin[],
  moduleIndex: ModuleIndex,
  exportIndex: ExportIndex,
): Map<SymbolId, WorkspaceSupersede> {
  const supersede = new Map<SymbolId, WorkspaceSupersede>();
  if (project.workspacePackages.length === 0) {
    return supersede;
  }
  const entryByName = new Map(project.workspacePackages.map((pkg) => [pkg.name, pkg.entry]));

  for (const edge of edges) {
    if (edge.kind !== 'imports' || supersede.has(edge.targetId)) {
      continue;
    }
    const external = decodeExternal(edge.targetId);
    const entry = external === null ? undefined : entryByName.get(external.packageName);
    if (external === null || entry === undefined) {
      continue;
    }
    const entryFileId = moduleIndex.fileId(entry);
    const plugin = plugins.find((candidate) => candidate.matches({ path: entry }));
    if (entryFileId === undefined || plugin === undefined) {
      continue;
    }
    const chain = resolveExportChain(
      { fileId: entryFileId, exportedName: external.name, typeOnly: false },
      plugin,
      moduleIndex,
      exportIndex,
      project,
    );
    if (chain.status === 'symbol') {
      supersede.set(edge.targetId, { internalId: chain.symbolId, certainty: chain.certainty });
    }
  }
  return supersede;
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

/** Decode an external symbol id to its package name and exported name, or null. */
function decodeExternal(id: SymbolId): { packageName: string; name: string } | null {
  let identity: ReturnType<typeof parseSymbolId>;
  try {
    identity = parseSymbolId(id);
  } catch {
    return null;
  }
  const last = identity.descriptors[identity.descriptors.length - 1];
  if (identity.package === undefined || last === undefined) {
    return null;
  }
  return { packageName: identity.package.name, name: last.name };
}
