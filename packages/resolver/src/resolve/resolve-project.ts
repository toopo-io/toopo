import {
  canonicalizeGraphDocument,
  type Edge,
  type FileNode,
  FORMAT_VERSION,
  type GraphDocument,
  GraphDocumentSchema,
  isFileNode,
} from '@toopo/core';
import type { ParseResult } from '@toopo/parser';
import type { ProjectModel, ResolverPlugin } from '../plugin/resolver-plugin.js';
import { buildExportIndex } from '../project/export-index.js';
import { buildModuleIndex } from '../project/module-index.js';
import { buildSymbolGraph } from '../project/symbol-graph.js';
import { bindFileCallSites } from './bind-call-sites.js';
import { bindFileImports } from './bind-imports.js';
import { type Diagnostic, sortDiagnostics } from './diagnostics.js';
import { applyWorkspaceSupersede, buildWorkspaceSupersede } from './workspace.js';

/**
 * The output of the Resolve pass (ADR-0016): one connected, canonicalized
 * `@toopo/core` graph for the whole project, plus the honest unresolved/
 * ambiguous tail as `diagnostics`. Diagnostics are pipeline data — like the
 * parser's `unresolved` — and are NOT part of the persisted graph model.
 */
export interface ResolveResult {
  readonly document: GraphDocument;
  readonly diagnostics: readonly Diagnostic[];
}

/** A fragment paired with its file node, for batched per-file resolution. */
interface FileFragment {
  readonly fragment: ParseResult;
  readonly file: FileNode;
}

/**
 * Resolve a project's per-file parse fragments into one connected graph
 * (ADR-0016 Resolve pass). Pure, in-memory, filesystem- and tree-sitter-free:
 * the project's file universe is exactly the supplied fragments.
 *
 * For each file the resolver binds its deferred relative/alias imports to real
 * exported symbols, then re-emits the cross-file call/render edges and prop
 * bindings the parser left for this pass — each tagged `deterministic` or
 * `inferred` by the language plugin, never upgraded by the engine (the trust
 * guarantee). Everything is unioned with the parse facts and ordered by the
 * shared core comparator for byte-identical determinism.
 */
const EMPTY_PROJECT: ProjectModel = { aliases: [], workspacePackages: [] };

export function resolveProject(
  fragments: readonly ParseResult[],
  plugins: readonly ResolverPlugin[],
  project: ProjectModel = EMPTY_PROJECT,
): ResolveResult {
  const nodes = fragments.flatMap((fragment) => fragment.document.nodes);
  const parseEdges = fragments.flatMap((fragment) => fragment.document.edges);

  const moduleIndex = buildModuleIndex(nodes);
  const exportIndex = buildExportIndex(fragments);
  const symbolGraph = buildSymbolGraph(nodes, parseEdges);

  const resolvedEdges: Edge[] = [];
  const diagnostics: Diagnostic[] = [];

  for (const { fragment, file } of orderByFileId(fragments)) {
    const plugin = plugins.find((candidate) => candidate.matches({ path: file.path }));
    if (plugin === undefined) {
      continue; // no resolver for this language; its parse facts still merge
    }
    const imports = bindFileImports(fragment, file, plugin, moduleIndex, exportIndex, project);
    resolvedEdges.push(...imports.edges);
    resolvedEdges.push(...bindFileCallSites(file, plugin, imports.resolvedImports, symbolGraph));
    diagnostics.push(...imports.diagnostics);
  }

  // Supersede provisional external edges for bare workspace imports with internal
  // ones (ADR-0016 Fork 2b) — a generic target-id rewrite over the whole graph.
  const supersede = buildWorkspaceSupersede(parseEdges, project, plugins, moduleIndex, exportIndex);
  const edges = applyWorkspaceSupersede([...parseEdges, ...resolvedEdges], supersede);

  const candidate: GraphDocument = {
    formatVersion: FORMAT_VERSION,
    nodes: dedupe(nodes),
    edges: dedupe(edges),
  };
  const document = canonicalizeGraphDocument(GraphDocumentSchema.parse(candidate));
  return { document, diagnostics: sortDiagnostics(diagnostics) };
}

/**
 * Remove structurally identical entries (ADR-0015 §11 — a relationship is stored
 * once). Two import statements from the same module, for example, each request a
 * module-level dependency edge; they collapse to one. Identity is the full
 * value, so distinct provenance/resolution is preserved.
 */
function dedupe<T>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    const key = JSON.stringify(item);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  }
  return unique;
}

/** Pair each fragment with its file node and order by file id (determinism). */
function orderByFileId(fragments: readonly ParseResult[]): FileFragment[] {
  const withFiles: FileFragment[] = [];
  for (const fragment of fragments) {
    const file = fragment.document.nodes.find(isFileNode);
    if (file !== undefined) {
      withFiles.push({ fragment, file });
    }
  }
  return withFiles.sort((a, b) => {
    if (a.file.id === b.file.id) {
      return 0;
    }
    return a.file.id < b.file.id ? -1 : 1;
  });
}
