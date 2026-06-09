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

/** Default depth cap for {@link GraphRepository.blastRadius} — bounds traversal
 *  cost and guarantees termination even on a cyclic graph (ADR-0017 §6). */
export const DEFAULT_BLAST_RADIUS_MAX_DEPTH = 32;

/**
 * Default edge kinds traversed by blast-radius: the inbound DEPENDENCY kinds.
 * `contains` (pure structure) and `exports` (a symbol's own declaring module,
 * not a dependent) are excluded — re-exporting structure is not impact. Pass an
 * explicit `kinds` to override.
 */
export const DEFAULT_BLAST_RADIUS_KINDS: readonly EdgeKind[] = [
  'imports',
  'references',
  'calls',
  'extends',
  'implements',
];

export interface BlastRadiusOptions {
  /** Maximum reverse-traversal depth. Defaults to {@link DEFAULT_BLAST_RADIUS_MAX_DEPTH}. */
  readonly maxDepth?: number;
  /** Edge kinds to traverse. Defaults to {@link DEFAULT_BLAST_RADIUS_KINDS}. */
  readonly kinds?: readonly EdgeKind[];
}

export interface BlastRadiusHit {
  /** A node that (transitively) depends on the queried node. */
  readonly nodeId: SymbolId;
  /** Shortest reverse distance from the queried node (always ≥ 1). */
  readonly depth: number;
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

  /**
   * Transitive reverse-reachability: every node that (transitively) depends on
   * `id`, by following forward dependency edges backwards (ADR-0015 §11). Each
   * hit carries its shortest depth. Bounded by `maxDepth` and made cycle-safe by
   * a visited-path guard, so the traversal always terminates (ADR-0017 §6). The
   * queried node itself is never a hit.
   */
  blastRadius(id: SymbolId, options?: BlastRadiusOptions): Promise<readonly BlastRadiusHit[]>;
}
