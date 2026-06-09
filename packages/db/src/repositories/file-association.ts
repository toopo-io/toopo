/**
 * Derives the incremental `file_id` key for every node and edge of a graph
 * document from its `contains` hierarchy (ADR-0015 §2). The key is what a future
 * per-file subgraph replacement will delete by (`replaceFileSubgraph`, deferred
 * — Decision 4); populating it now keeps the persisted data incremental-ready
 * without a backfill migration.
 *
 *   - a file node is its own file,
 *   - a symbol / call-site resolves to the file that (transitively) contains it,
 *   - a repo / package (above the file level) has no file — `null`,
 *   - an edge belongs to the file of its SOURCE (the file whose analysis
 *     produced it), so re-analyzing a file replaces its outgoing edges.
 *
 * The upward walk is cycle-guarded: a malformed containment cycle resolves to
 * `null` rather than looping (graceful degradation, never fatal).
 */
import { type Edge, type GraphDocument, isFileNode } from '@toopo/core';

export interface FileIndex {
  /** The file that owns a node by id, or `null` for repo/package/unrooted nodes. */
  forNode(id: string): string | null;
  /** The file that owns an edge (its source's file), or `null`. */
  forEdge(edge: Edge): string | null;
}

export function buildFileIndex(document: GraphDocument): FileIndex {
  const fileIds = new Set(document.nodes.filter(isFileNode).map((node) => node.id));

  const parentOf = new Map<string, string>();
  for (const edge of document.edges) {
    if (edge.kind === 'contains') {
      // A node is contained by exactly one parent in a well-formed graph; the
      // last contains-edge wins deterministically if the input is malformed.
      parentOf.set(edge.targetId, edge.sourceId);
    }
  }

  const memo = new Map<string, string | null>();

  function resolve(id: string): string | null {
    const cached = memo.get(id);
    if (cached !== undefined) {
      return cached;
    }
    if (fileIds.has(id)) {
      memo.set(id, id);
      return id;
    }
    const seen = new Set<string>([id]);
    let current = id;
    while (true) {
      const parent = parentOf.get(current);
      if (parent === undefined) {
        memo.set(id, null);
        return null;
      }
      if (fileIds.has(parent)) {
        memo.set(id, parent);
        return parent;
      }
      if (seen.has(parent)) {
        memo.set(id, null);
        return null;
      }
      seen.add(parent);
      current = parent;
    }
  }

  return {
    forNode: (id) => resolve(id),
    forEdge: (edge) => resolve(edge.sourceId),
  };
}
