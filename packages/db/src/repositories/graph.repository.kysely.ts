/**
 * Kysely implementation of {@link GraphRepository}. Portable across both backends
 * (ADR-0017 §6): parameterized everywhere, `ON CONFLICT ... DO UPDATE SET col =
 * excluded.col` (the `excluded` pseudo-table exists on both libSQL-SQLite and
 * Postgres), and every row leaves the repository through the core Zod boundary.
 *
 * Persist is idempotent (ADR-0015 §11): the document is deduped in memory — by
 * `SymbolId` for nodes, by canonical identity key for edges — then upserted, so
 * re-persisting the same graph leaves the row count unchanged. Bulk inserts are
 * chunked to stay within SQLite's bound-parameter limit on large graphs.
 */
import {
  type EdgeKind,
  type GraphDocument,
  GraphDocumentSchema,
  type Node,
  type SymbolId,
} from '@toopo/core';
import type { Kysely } from 'kysely';
import type { GraphDatabase } from '../schema/graph-types.js';
import { buildFileIndex } from './file-association.js';
import type {
  GraphRepository,
  Neighbor,
  NeighborDirection,
  PersistGraphResult,
} from './graph.repository.js';
import { edgeToInsert, nodeToInsert, rowToEdge, rowToNode } from './graph-records.js';

/** Rows per bulk insert. Node is the widest table (16 columns); 500 rows stays
 *  well under SQLite's default 32766 bound-parameter ceiling on both drivers. */
const UPSERT_CHUNK = 500;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

/** Keep the last occurrence per key — matching the canonical "last wins" of the
 *  core comparators, so dedup is deterministic and stored-once. */
function dedupe<T>(rows: readonly T[], key: (row: T) => string): T[] {
  const map = new Map<string, T>();
  for (const row of rows) {
    map.set(key(row), row);
  }
  return [...map.values()];
}

export class KyselyGraphRepository implements GraphRepository {
  constructor(private readonly db: Kysely<GraphDatabase>) {}

  async persistGraph(document: GraphDocument): Promise<PersistGraphResult> {
    const parsed = GraphDocumentSchema.parse(document);
    const index = buildFileIndex(parsed);

    const nodeRows = dedupe(
      parsed.nodes.map((node) => nodeToInsert(node, index.forNode(node.id))),
      (row) => row.id,
    );
    const edgeRows = dedupe(
      parsed.edges.map((edge) => edgeToInsert(edge, index.forEdge(edge))),
      (row) => row.edge_key,
    );

    await this.db.transaction().execute(async (trx) => {
      for (const batch of chunk(nodeRows, UPSERT_CHUNK)) {
        await trx
          .insertInto('node')
          .values(batch)
          .onConflict((oc) =>
            oc.column('id').doUpdateSet((eb) => ({
              kind: eb.ref('excluded.kind'),
              sub_kind: eb.ref('excluded.sub_kind'),
              name: eb.ref('excluded.name'),
              path: eb.ref('excluded.path'),
              content_hash: eb.ref('excluded.content_hash'),
              version: eb.ref('excluded.version'),
              enclosing_symbol_id: eb.ref('excluded.enclosing_symbol_id'),
              callee: eb.ref('excluded.callee'),
              ordinal: eb.ref('excluded.ordinal'),
              analysis_status: eb.ref('excluded.analysis_status'),
              analysis_reason: eb.ref('excluded.analysis_reason'),
              file_id: eb.ref('excluded.file_id'),
              location: eb.ref('excluded.location'),
              payload: eb.ref('excluded.payload'),
              properties: eb.ref('excluded.properties'),
            })),
          )
          .execute();
      }

      for (const batch of chunk(edgeRows, UPSERT_CHUNK)) {
        await trx
          .insertInto('edge')
          .values(batch)
          .onConflict((oc) =>
            oc.column('edge_key').doUpdateSet((eb) => ({
              source_id: eb.ref('excluded.source_id'),
              target_id: eb.ref('excluded.target_id'),
              kind: eb.ref('excluded.kind'),
              sub_kind: eb.ref('excluded.sub_kind'),
              resolution: eb.ref('excluded.resolution'),
              confidence: eb.ref('excluded.confidence'),
              provenance_pass: eb.ref('excluded.provenance_pass'),
              provenance_rule: eb.ref('excluded.provenance_rule'),
              file_id: eb.ref('excluded.file_id'),
            })),
          )
          .execute();
      }
    });

    return { nodes: nodeRows.length, edges: edgeRows.length };
  }

  async getNode(id: SymbolId): Promise<Node | null> {
    const row = await this.db
      .selectFrom('node')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row === undefined ? null : rowToNode(row);
  }

  async neighbors(
    id: SymbolId,
    direction: NeighborDirection,
    kind?: EdgeKind,
  ): Promise<readonly Neighbor[]> {
    const anchorColumn = direction === 'out' ? 'source_id' : 'target_id';
    let query = this.db.selectFrom('edge').selectAll().where(anchorColumn, '=', id);
    if (kind !== undefined) {
      query = query.where('kind', '=', kind);
    }
    // Deterministic order so callers and tests see a stable result.
    const edgeRows = await query.orderBy('edge_key').execute();
    const edges = edgeRows.map(rowToEdge);

    // The far end is the target for `out`, the source for `in`. Batch-load those
    // nodes in one query to avoid an N+1 fan-out.
    const farEndId = (edge: (typeof edges)[number]): SymbolId =>
      direction === 'out' ? edge.targetId : edge.sourceId;
    const nodesById = await this.loadNodes(edges.map(farEndId));

    return edges.map((edge) => ({ edge, node: nodesById.get(farEndId(edge)) ?? null }));
  }

  /** Batch-load validated nodes by id into a lookup map (absent ids are simply omitted). */
  private async loadNodes(ids: readonly SymbolId[]): Promise<Map<SymbolId, Node>> {
    const distinct = [...new Set(ids)];
    if (distinct.length === 0) {
      return new Map();
    }
    const rows = await this.db.selectFrom('node').selectAll().where('id', 'in', distinct).execute();
    return new Map(rows.map((row) => [row.id, rowToNode(row)]));
  }
}
