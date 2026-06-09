/**
 * The graph persistence abstraction (ADR-0017 §1 repository pattern), mirroring
 * {@link UserRepository}. Callers depend on this interface, never on Kysely, so
 * the storage engine stays swappable behind it. The interface grows by slice:
 * S3 persist + read, S4 neighbors, S5 blast-radius.
 */
import type { Edge, EdgeKind, GraphDocument, Node, SymbolId } from '@toopo/core';

export interface PersistGraphResult {
  /** Distinct nodes written (after stored-once dedup). */
  readonly nodes: number;
  /** Distinct edges written (after stored-once dedup). */
  readonly edges: number;
}

/** Which way to follow edges from a node (ADR-0015 §11: reverse is derived). */
export type NeighborDirection = 'in' | 'out';

export interface Neighbor {
  /** The connecting edge, in its canonical forward direction. */
  readonly edge: Edge;
  /**
   * The node on the FAR end of the edge — the target for `out`, the source for
   * `in` — or `null` when that end is an external/unresolved identity with no
   * node row (ADR-0015 Fork 1).
   */
  readonly node: Node | null;
}

export interface GraphRepository {
  /**
   * Persist a graph document idempotently (ADR-0015 §11 stored-once): nodes are
   * upserted by their `SymbolId`, edges by their canonical identity key, so
   * re-persisting the same document is a no-op on row count. The document is a
   * fragment (whole-repo or one changed file), merged into the current graph —
   * never a destructive replace (per-file replacement is deferred, Decision 4).
   */
  persistGraph(document: GraphDocument): Promise<PersistGraphResult>;

  /** The validated node for an id, or `null` when absent. */
  getNode(id: SymbolId): Promise<Node | null>;

  /**
   * The edges incident to a node and the node on each edge's far end. `out`
   * follows forward edges (what `id` depends on), `in` follows them in reverse
   * (who depends on `id`); an optional `kind` filters to one edge kind. Results
   * are ordered deterministically by edge identity.
   */
  neighbors(
    id: SymbolId,
    direction: NeighborDirection,
    kind?: EdgeKind,
  ): Promise<readonly Neighbor[]>;
}
