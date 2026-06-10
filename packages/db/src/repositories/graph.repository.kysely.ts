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
  type Edge,
  type EdgeKind,
  edgeIdentityKey,
  type GraphDocument,
  GraphDocumentSchema,
  type Node,
  type SymbolId,
} from '@toopo/core';
import { type Insertable, type Kysely, type RawBuilder, type SqlBool, sql } from 'kysely';
import type { EdgeTable, GraphDatabase, NodeTable } from '../schema/graph-types.js';
import { selectChildCounts, selectContainerRows, selectProjectedEdges } from './aggregate-sql.js';
import { BLAST_PATH_SEPARATOR, blastRadiusCte } from './blast-radius-sql.js';
import { buildFileIndex } from './file-association.js';
import {
  type BlastRadiusHit,
  type BlastRadiusNode,
  type BlastRadiusOptions,
  type BlastRadiusPage,
  type BlastRadiusPageOptions,
  DEFAULT_BLAST_RADIUS_KINDS,
  DEFAULT_BLAST_RADIUS_MAX_DEPTH,
  type GraphRepository,
  type MapView,
  type MapViewOptions,
  type Neighbor,
  type NeighborDirection,
  type NeighborPageOptions,
  type PathResolution,
  type PersistGraphResult,
  type SearchOptions,
} from './graph.repository.js';
import {
  buildPage,
  clampLimit,
  decodeCursorTuple,
  encodeCursor,
  type Page,
  type PageOptions,
} from './graph-page.js';
import { edgeToInsert, nodeToInsert, rowToEdge, rowToNode } from './graph-records.js';
import type { GraphScope } from './graph-scope.js';
import { escapeLikeOperand, LIKE_ESCAPE } from './sql-like.js';

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

interface DocumentRows {
  readonly nodeRows: readonly Insertable<NodeTable>[];
  readonly edgeRows: readonly Insertable<EdgeTable>[];
}

/**
 * Validate a document at the boundary (ADR-0006) and project it to deduped,
 * project-scoped insert rows with their incremental `file_id` derived from the
 * containment hierarchy. Shared by {@link KyselyGraphRepository.persistGraph} (an
 * additive upsert) and {@link KyselyGraphRepository.replaceProjectGraph} (a full
 * replace) — the row shape is identical; only the write strategy differs.
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

/** The edge column anchored to the queried node: source for forward, target for reverse. */
function anchorColumn(direction: NeighborDirection): 'source_id' | 'target_id' {
  return direction === 'out' ? 'source_id' : 'target_id';
}

export class KyselyGraphRepository implements GraphRepository {
  constructor(private readonly db: Kysely<GraphDatabase>) {}

  async persistGraph(scope: GraphScope, document: GraphDocument): Promise<PersistGraphResult> {
    const { nodeRows, edgeRows } = buildDocumentRows(scope, document);
    await this.db.transaction().execute((trx) => writeDocumentRows(trx, nodeRows, edgeRows));
    return { nodes: nodeRows.length, edges: edgeRows.length };
  }

  async replaceProjectGraph(
    scope: GraphScope,
    document: GraphDocument,
  ): Promise<PersistGraphResult> {
    const { nodeRows, edgeRows } = buildDocumentRows(scope, document);
    await this.db.transaction().execute(async (trx) => {
      // Delete the whole project subgraph, then write the fresh document. Edges
      // first (they reference nodes logically, though no FK enforces it). After
      // the delete the project's rows are gone, so the upsert in writeDocumentRows
      // can never conflict — it behaves as a plain insert, with zero duplication.
      await trx.deleteFrom('edge').where('project_id', '=', scope.projectId).execute();
      await trx.deleteFrom('node').where('project_id', '=', scope.projectId).execute();
      await writeDocumentRows(trx, nodeRows, edgeRows);
    });
    return { nodes: nodeRows.length, edges: edgeRows.length };
  }

  async getFileContentHashes(scope: GraphScope): Promise<ReadonlyMap<string, string>> {
    const rows = await this.db
      .selectFrom('node')
      .select(['path', 'content_hash'])
      .where('project_id', '=', scope.projectId)
      .where('kind', '=', 'file')
      .execute();
    const hashes = new Map<string, string>();
    for (const row of rows) {
      // A file node always carries both (ADR-0015 §10); the null-guard is defensive
      // and simply omits a malformed row rather than poisoning the delta.
      if (row.path !== null && row.content_hash !== null) {
        hashes.set(row.path, row.content_hash);
      }
    }
    return hashes;
  }

  async getNode(scope: GraphScope, id: SymbolId): Promise<Node | null> {
    const row = await this.db
      .selectFrom('node')
      .selectAll()
      .where('project_id', '=', scope.projectId)
      .where('id', '=', id)
      .executeTakeFirst();
    return row === undefined ? null : rowToNode(row);
  }

  async neighbors(
    scope: GraphScope,
    id: SymbolId,
    direction: NeighborDirection,
    kind?: EdgeKind,
  ): Promise<readonly Neighbor[]> {
    let query = this.db
      .selectFrom('edge')
      .selectAll()
      .where('project_id', '=', scope.projectId)
      .where(anchorColumn(direction), '=', id);
    if (kind !== undefined) {
      query = query.where('kind', '=', kind);
    }
    // Deterministic order so callers and tests see a stable result.
    const edgeRows = await query.orderBy('edge_key').execute();
    return this.hydrateNeighbors(scope, edgeRows.map(rowToEdge), direction);
  }

  /**
   * Pair each edge with the node on its far end (target for `out`, source for
   * `in`), batch-loading those nodes in one query to avoid an N+1 fan-out. An
   * external/unresolved far end with no node row yields `null` (ADR-0015 Fork 1).
   */
  private async hydrateNeighbors(
    scope: GraphScope,
    edges: readonly Edge[],
    direction: NeighborDirection,
  ): Promise<Neighbor[]> {
    const farEndId = (edge: Edge): SymbolId =>
      direction === 'out' ? edge.targetId : edge.sourceId;
    const nodesById = await this.loadNodes(scope, edges.map(farEndId));
    return edges.map((edge) => ({ edge, node: nodesById.get(farEndId(edge)) ?? null }));
  }

  /**
   * Batch-load validated nodes by id WITHIN the project into a lookup map (absent
   * ids are simply omitted). The project scope is essential: a far-end id can
   * collide with another project's node (ids are unique only per project), so an
   * unscoped load would hydrate a cross-tenant node (ADR-0022 §3).
   */
  private async loadNodes(
    scope: GraphScope,
    ids: readonly SymbolId[],
  ): Promise<Map<SymbolId, Node>> {
    const distinct = [...new Set(ids)];
    if (distinct.length === 0) {
      return new Map();
    }
    const rows = await this.db
      .selectFrom('node')
      .selectAll()
      .where('project_id', '=', scope.projectId)
      .where('id', 'in', distinct)
      .execute();
    return new Map(rows.map((row) => [row.id, rowToNode(row)]));
  }

  async blastRadius(
    scope: GraphScope,
    id: SymbolId,
    options?: BlastRadiusOptions,
  ): Promise<readonly BlastRadiusHit[]> {
    if (id.includes(BLAST_PATH_SEPARATOR)) {
      // The visited-path delimiter must never appear inside an id (it cannot, for
      // parser-emitted SymbolIds). Reject explicitly rather than risk a silent
      // cycle-guard collision.
      throw new Error('blastRadius: id must not contain the U+001F path separator');
    }
    const maxDepth = options?.maxDepth ?? DEFAULT_BLAST_RADIUS_MAX_DEPTH;
    const kinds = options?.kinds ?? DEFAULT_BLAST_RADIUS_KINDS;
    if (maxDepth < 1 || kinds.length === 0) {
      return [];
    }

    const cte = blastRadiusCte({ projectId: scope.projectId, startId: id, kinds, maxDepth });
    const query = sql<{ node_id: string; depth: number; path_det: number }>`${cte}
      select "node_id", min("depth") as "depth", max("path_det") as "path_det"
      from "blast"
      where "depth" > 0
      group by "node_id"`;
    const { rows } = await query.execute(this.db);
    return rows.map((row) => ({
      nodeId: row.node_id,
      depth: Number(row.depth),
      pathResolution: toPathResolution(row.path_det),
    }));
  }

  async neighborsPage(
    scope: GraphScope,
    id: SymbolId,
    direction: NeighborDirection,
    options?: NeighborPageOptions,
  ): Promise<Page<Neighbor>> {
    const limit = clampLimit(options?.limit);
    let query = this.db
      .selectFrom('edge')
      .selectAll()
      .where('project_id', '=', scope.projectId)
      .where(anchorColumn(direction), '=', id);
    if (options?.kind !== undefined) {
      query = query.where('kind', '=', options.kind);
    }
    if (options?.cursor !== undefined) {
      query = query.where('edge_key', '>', String(decodeCursorTuple(options.cursor, 1)[0]));
    }
    const edgeRows = await query
      .orderBy('edge_key')
      .limit(limit + 1)
      .execute();
    const neighbors = await this.hydrateNeighbors(scope, edgeRows.map(rowToEdge), direction);
    return buildPage(neighbors, limit, (neighbor) =>
      encodeCursor([edgeIdentityKey(neighbor.edge)]),
    );
  }

  async search(scope: GraphScope, options?: SearchOptions): Promise<Page<Node>> {
    const limit = clampLimit(options?.limit);
    let query = this.db.selectFrom('node').selectAll().where('project_id', '=', scope.projectId);
    if (options?.kind !== undefined) {
      query = query.where('kind', '=', options.kind);
    }
    if (options?.subKind !== undefined) {
      query = query.where('sub_kind', '=', options.subKind);
    }
    if (options?.query !== undefined && options.query.length > 0) {
      query = query.where(nameOrPathMatches(options.query));
    }
    if (options?.cursor !== undefined) {
      query = query.where('id', '>', String(decodeCursorTuple(options.cursor, 1)[0]));
    }
    const rows = await query
      .orderBy('id')
      .limit(limit + 1)
      .execute();
    return buildPage(rows.map(rowToNode), limit, (node) => encodeCursor([node.id]));
  }

  async declaredInterface(
    scope: GraphScope,
    id: SymbolId,
    options?: PageOptions,
  ): Promise<Page<Node>> {
    const limit = clampLimit(options?.limit);
    // Both sides are scoped: the contains edge AND the contained node, so a
    // colliding id in another project can never join in (ADR-0022 §3).
    let query = this.db
      .selectFrom('edge as c')
      .innerJoin('node as n', 'n.id', 'c.target_id')
      .where('c.project_id', '=', scope.projectId)
      .where('n.project_id', '=', scope.projectId)
      .where('c.source_id', '=', id)
      .where('c.kind', '=', 'contains')
      .where('n.kind', '=', 'symbol')
      .selectAll('n');
    if (options?.cursor !== undefined) {
      query = query.where('n.id', '>', String(decodeCursorTuple(options.cursor, 1)[0]));
    }
    const rows = await query
      .orderBy('n.id')
      .limit(limit + 1)
      .execute();
    return buildPage(rows.map(rowToNode), limit, (node) => encodeCursor([node.id]));
  }

  async callSitesOf(scope: GraphScope, id: SymbolId, options?: PageOptions): Promise<Page<Node>> {
    const limit = clampLimit(options?.limit);
    let query = this.db
      .selectFrom('node')
      .selectAll()
      .where('project_id', '=', scope.projectId)
      .where('enclosing_symbol_id', '=', id)
      .where('kind', '=', 'callSite');
    if (options?.cursor !== undefined) {
      query = query.where('id', '>', String(decodeCursorTuple(options.cursor, 1)[0]));
    }
    const rows = await query
      .orderBy('id')
      .limit(limit + 1)
      .execute();
    return buildPage(rows.map(rowToNode), limit, (node) => encodeCursor([node.id]));
  }

  async blastRadiusPage(
    scope: GraphScope,
    id: SymbolId,
    options?: BlastRadiusPageOptions,
  ): Promise<BlastRadiusPage> {
    if (id.includes(BLAST_PATH_SEPARATOR)) {
      throw new Error('blastRadiusPage: id must not contain the U+001F path separator');
    }
    const maxDepth = options?.maxDepth ?? DEFAULT_BLAST_RADIUS_MAX_DEPTH;
    const kinds = options?.kinds ?? DEFAULT_BLAST_RADIUS_KINDS;
    const limit = clampLimit(options?.limit);
    if (maxDepth < 1 || kinds.length === 0) {
      return { items: [], nextCursor: null, truncated: false };
    }

    const rawRows = await this.runBlastRadiusPage(
      scope,
      id,
      kinds,
      maxDepth,
      limit,
      options?.cursor,
    );
    const maxDepthReached = rawRows.length > 0 ? Number(rawRows[0]?.max_depth) : 0;
    const hits: BlastRadiusHit[] = rawRows.map((row) => ({
      nodeId: row.node_id,
      depth: Number(row.depth),
      pathResolution: toPathResolution(row.path_det),
    }));
    const nodesById = await this.loadNodes(
      scope,
      hits.map((hit) => hit.nodeId),
    );
    const hydrated: BlastRadiusNode[] = hits.map((hit) => ({
      ...hit,
      node: nodesById.get(hit.nodeId) ?? null,
    }));
    const page = buildPage(hydrated, limit, (hit) => encodeCursor([hit.depth, hit.nodeId]));
    return {
      items: page.items,
      nextCursor: page.nextCursor,
      truncated: maxDepthReached >= maxDepth,
    };
  }

  /** Execute the keyset-paginated blast-radius CTE (ordered by depth, then id). */
  private async runBlastRadiusPage(
    scope: GraphScope,
    id: SymbolId,
    kinds: readonly EdgeKind[],
    maxDepth: number,
    limit: number,
    cursor: string | undefined,
  ): Promise<Array<{ node_id: string; depth: number; path_det: number; max_depth: number }>> {
    const cte = blastRadiusCte({ projectId: scope.projectId, startId: id, kinds, maxDepth });
    const keyset = blastKeysetClause(cursor);
    const query = sql<{
      node_id: string;
      depth: number;
      path_det: number;
      max_depth: number;
    }>`${cte},
      "hits" as (
        select "node_id", min("depth") as "depth", max("path_det") as "path_det"
        from "blast" where "depth" > 0 group by "node_id"
      )
      select "node_id", "depth", "path_det", (select max("depth") from "hits") as "max_depth"
      from "hits"
      ${keyset}
      order by "depth" asc, "node_id" asc
      limit ${limit + 1}`;
    const { rows } = await query.execute(this.db);
    return rows;
  }

  async mapView(scope: GraphScope, options: MapViewOptions): Promise<MapView> {
    if (options.level === 'symbol' && options.scope === undefined) {
      throw new Error('mapView: the symbol level requires a file scope');
    }
    const limit = clampLimit(options.limit);
    const containerRows = await selectContainerRows(
      this.db,
      scope.projectId,
      options.level,
      options.scope,
      limit + 1,
    );
    const truncated = containerRows.length > limit;
    const kept = truncated ? containerRows.slice(0, limit) : containerRows;
    const ids = kept.map((row) => row.id);
    const [counts, edges] = await Promise.all([
      selectChildCounts(this.db, scope.projectId, options.level, ids),
      selectProjectedEdges(this.db, scope.projectId, options.level, ids),
    ]);
    const nodes = kept.map((row) => ({
      node: rowToNode(row),
      childCount: counts.get(row.id) ?? 0,
    }));
    return { level: options.level, nodes, edges, truncated };
  }
}

/** Portable case-insensitive name/path substring predicate (escaped LIKE). */
function nameOrPathMatches(query: string): RawBuilder<SqlBool> {
  const pattern = sql`'%' || lower(${escapeLikeOperand(sql`${query}`)}) || '%'`;
  return sql<SqlBool>`(
    lower(coalesce("name", '')) like ${pattern} escape ${LIKE_ESCAPE}
    or lower(coalesce("path", '')) like ${pattern} escape ${LIKE_ESCAPE}
  )`;
}

/**
 * Map the aggregated path-determinism flag (`max(path_det)`, a 0/1 integer that
 * may arrive as a number or driver-stringified) to its trust literal (ADR-0021):
 * 1 — a fully-deterministic path reaches the node — is `deterministic`; anything
 * else is `inferred`. The integer→literal step lives in TS, never in SQL, so no
 * backend-specific boolean rendering leaks into the portable query.
 */
function toPathResolution(flag: number | string | bigint): PathResolution {
  return Number(flag) === 1 ? 'deterministic' : 'inferred';
}

/** The keyset WHERE clause for blast-radius paging, or empty on the first page. */
function blastKeysetClause(cursor: string | undefined): RawBuilder<unknown> {
  if (cursor === undefined) {
    return sql``;
  }
  const [depthPart, nodePart] = decodeCursorTuple(cursor, 2);
  const depth = Number(depthPart);
  const nodeId = String(nodePart);
  return sql`where ("depth" > ${depth} or ("depth" = ${depth} and "node_id" > ${nodeId}))`;
}
