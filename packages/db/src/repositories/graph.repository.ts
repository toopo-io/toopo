/**
 * The graph persistence abstraction (ADR-0017 §1 repository pattern), mirroring
 * {@link UserRepository}. Callers depend on this interface, never on Kysely, so
 * the storage engine stays swappable behind it. The interface grows by slice:
 * S3 persist + read, S4 neighbors, S5 blast-radius.
 */
import type { GraphDocument, Node, SymbolId } from '@toopo/core';

export interface PersistGraphResult {
  /** Distinct nodes written (after stored-once dedup). */
  readonly nodes: number;
  /** Distinct edges written (after stored-once dedup). */
  readonly edges: number;
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
}
