/**
 * Persistence for the Kysely graph repository: validate a {@link GraphDocument}
 * at the boundary (ADR-0006), project it to deduped, project-scoped insert rows,
 * and write them transactionally. Two write strategies share one row-building and
 * one chunked-upsert path: an additive upsert ({@link persistGraph}) and a full
 * project replace ({@link replaceProjectGraph}).
 *
 * Portable across both backends (ADR-0017 §6): `ON CONFLICT ... DO UPDATE SET
 * col = excluded.col` uses the `excluded` pseudo-table, which exists on both
 * libSQL-SQLite and Postgres. Persist is idempotent (ADR-0015 §11): the document
 * is deduped in memory — by `SymbolId` for nodes, by canonical identity key for
 * edges — then upserted, so re-persisting the same graph leaves the row count
 * unchanged. Bulk inserts are chunked to stay within SQLite's bound-parameter
 * limit on large graphs.
 */
import { type GraphDocument, GraphDocumentSchema, type UnresolvedReference } from '@toopo/core';
import type { Insertable, Kysely } from 'kysely';
import type {
  EdgeTable,
  GraphDatabase,
  NodeTable,
  UnresolvedReferenceTable,
} from '../schema/graph-types.js';
import { chunk } from './chunk.js';
import { buildFileIndex } from './file-association.js';
import type { PersistGraphResult } from './graph.repository.js';
import { edgeToInsert, nodeToInsert, unresolvedReferenceToInsert } from './graph-records.js';
import type { GraphScope } from './graph-scope.js';

/** Rows per bulk insert. Node is the widest table (16 columns); 500 rows stays
 *  well under SQLite's default 32766 bound-parameter ceiling on both drivers. */
const UPSERT_CHUNK = 500;

/** Keep the last occurrence per key — matching the canonical "last wins" of the
 *  core comparators, so dedup is deterministic and stored-once. */
function dedupe<T>(rows: readonly T[], key: (row: T) => string): T[] {
  const map = new Map<string, T>();
  for (const row of rows) {
    map.set(key(row), row);
  }
  return [...map.values()];
}

interface DocumentRows {
  readonly nodeRows: readonly Insertable<NodeTable>[];
  readonly edgeRows: readonly Insertable<EdgeTable>[];
}

/**
 * Validate a document at the boundary (ADR-0006) and project it to deduped,
 * project-scoped insert rows with their incremental `file_id` derived from the
 * containment hierarchy. Shared by {@link persistGraph} (an additive upsert) and
 * {@link replaceProjectGraph} (a full replace) — the row shape is identical; only
 * the write strategy differs.
 */
function buildDocumentRows(scope: GraphScope, document: GraphDocument): DocumentRows {
  const parsed = GraphDocumentSchema.parse(document);
  const index = buildFileIndex(parsed);
  const nodeRows = dedupe(
    parsed.nodes.map((node) => nodeToInsert(node, index.forNode(node.id), scope.projectId)),
    (row) => row.id,
  );
  const edgeRows = dedupe(
    parsed.edges.map((edge) => edgeToInsert(edge, index.forEdge(edge), scope.projectId)),
    (row) => row.edge_key,
  );
  return { nodeRows, edgeRows };
}

/**
 * Upsert the node and edge rows in chunked batches within the given transaction
 * (ADR-0015 §11 stored-once). Idempotent: re-writing the same rows updates them
 * in place, leaving the row count unchanged. After a full project delete the
 * `onConflict` clause is simply never reached — the same body inserts cleanly,
 * which is why replaceProjectGraph reuses it verbatim (zero duplication).
 */
async function writeDocumentRows(
  trx: Kysely<GraphDatabase>,
  nodeRows: readonly Insertable<NodeTable>[],
  edgeRows: readonly Insertable<EdgeTable>[],
): Promise<void> {
  for (const batch of chunk(nodeRows, UPSERT_CHUNK)) {
    await trx
      .insertInto('node')
      .values(batch)
      .onConflict((oc) =>
        oc.columns(['project_id', 'id']).doUpdateSet((eb) => ({
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
        oc.columns(['project_id', 'edge_key']).doUpdateSet((eb) => ({
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
}

/** Project the resolve pass's honest tail to deduped, project-scoped insert rows
 *  (stored-once by ref_key, ADR-0015 §11). */
function buildUnresolvedReferenceRows(
  scope: GraphScope,
  references: readonly UnresolvedReference[],
): Insertable<UnresolvedReferenceTable>[] {
  return dedupe(
    references.map((reference) => unresolvedReferenceToInsert(reference, scope.projectId)),
    (row) => row.ref_key,
  );
}

/**
 * Upsert the unresolved-reference rows in chunked batches within the given
 * transaction (ADR-0016 amendment, C11). Idempotent: re-writing the same rows
 * updates them in place. After a full project delete the `onConflict` clause is
 * never reached — it inserts cleanly, so replaceProjectGraph reuses it verbatim.
 */
async function writeUnresolvedReferenceRows(
  trx: Kysely<GraphDatabase>,
  rows: readonly Insertable<UnresolvedReferenceTable>[],
): Promise<void> {
  for (const batch of chunk(rows, UPSERT_CHUNK)) {
    await trx
      .insertInto('unresolved_reference')
      .values(batch)
      .onConflict((oc) =>
        oc.columns(['project_id', 'ref_key']).doUpdateSet((eb) => ({
          importer_file_id: eb.ref('excluded.importer_file_id'),
          code: eb.ref('excluded.code'),
          specifier: eb.ref('excluded.specifier'),
          target_file_id: eb.ref('excluded.target_file_id'),
          name: eb.ref('excluded.name'),
          message: eb.ref('excluded.message'),
        })),
      )
      .execute();
  }
}

export async function persistGraph(
  db: Kysely<GraphDatabase>,
  scope: GraphScope,
  document: GraphDocument,
  unresolvedReferences: readonly UnresolvedReference[] = [],
): Promise<PersistGraphResult> {
  const { nodeRows, edgeRows } = buildDocumentRows(scope, document);
  const refRows = buildUnresolvedReferenceRows(scope, unresolvedReferences);
  await db.transaction().execute(async (trx) => {
    await writeDocumentRows(trx, nodeRows, edgeRows);
    await writeUnresolvedReferenceRows(trx, refRows);
  });
  return { nodes: nodeRows.length, edges: edgeRows.length };
}

export async function replaceProjectGraph(
  db: Kysely<GraphDatabase>,
  scope: GraphScope,
  document: GraphDocument,
  unresolvedReferences: readonly UnresolvedReference[] = [],
): Promise<PersistGraphResult> {
  const { nodeRows, edgeRows } = buildDocumentRows(scope, document);
  const refRows = buildUnresolvedReferenceRows(scope, unresolvedReferences);
  await db.transaction().execute(async (trx) => {
    // Delete the whole project subgraph and its unresolved tail, then write the
    // fresh ones. Edges first (they reference nodes logically, though no FK
    // enforces it). After the delete the project's rows are gone, so the upserts
    // can never conflict — they behave as plain inserts, with zero duplication.
    await trx.deleteFrom('edge').where('project_id', '=', scope.projectId).execute();
    await trx.deleteFrom('node').where('project_id', '=', scope.projectId).execute();
    await trx
      .deleteFrom('unresolved_reference')
      .where('project_id', '=', scope.projectId)
      .execute();
    await writeDocumentRows(trx, nodeRows, edgeRows);
    await writeUnresolvedReferenceRows(trx, refRows);
  });
  return { nodes: nodeRows.length, edges: edgeRows.length };
}
