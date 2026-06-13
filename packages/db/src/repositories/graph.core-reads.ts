/**
 * Core graph reads for the Kysely repository: file content-hash snapshot, single
 * node lookup, edge neighbors (eager and keyset-paged), and the recursive
 * blast-radius traversal (eager and keyset-paged). Every read is project-scoped
 * (ADR-0022 §3) and every row leaves through the core Zod boundary.
 */
import { type Edge, type EdgeKind, edgeIdentityKey, type Node, type SymbolId } from '@toopo/core';
import { type Kysely, type RawBuilder, sql } from 'kysely';
import type { GraphDatabase } from '../schema/graph-types.js';
import { BLAST_PATH_SEPARATOR, blastRadiusCte } from './blast-radius-sql.js';
import { countAll } from './graph.query-helpers.js';
import {
  type BlastRadiusHit,
  type BlastRadiusNode,
  type BlastRadiusOptions,
  type BlastRadiusPage,
  type BlastRadiusPageOptions,
  DEFAULT_BLAST_RADIUS_KINDS,
  DEFAULT_BLAST_RADIUS_MAX_DEPTH,
  type Neighbor,
  type NeighborDirection,
  type NeighborPageOptions,
  type PathResolution,
} from './graph.repository.js';
import {
  buildPage,
  clampLimit,
  decodeCursorTuple,
  encodeCursor,
  firstPageTotal,
  numberCursorPart,
  type Page,
} from './graph-page.js';
import { rowToEdge, rowToNode } from './graph-records.js';
import type { GraphScope } from './graph-scope.js';

/** The edge column anchored to the queried node: source for forward, target for reverse. */
function anchorColumn(direction: NeighborDirection): 'source_id' | 'target_id' {
  return direction === 'out' ? 'source_id' : 'target_id';
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
  // The depth slot must hold the number the server encoded — a forged string
  // there is a 400 (InvalidCursorError), never a NaN bind parameter.
  const depth = numberCursorPart(depthPart, cursor);
  const nodeId = String(nodePart);
  return sql`where ("depth" > ${depth} or ("depth" = ${depth} and "node_id" > ${nodeId}))`;
}

/**
 * Batch-load validated nodes by id WITHIN the project into a lookup map (absent
 * ids are simply omitted). The project scope is essential: a far-end id can
 * collide with another project's node (ids are unique only per project), so an
 * unscoped load would hydrate a cross-tenant node (ADR-0022 §3).
 */
async function loadNodes(
  db: Kysely<GraphDatabase>,
  scope: GraphScope,
  ids: readonly SymbolId[],
): Promise<Map<SymbolId, Node>> {
  const distinct = [...new Set(ids)];
  if (distinct.length === 0) {
    return new Map();
  }
  const rows = await db
    .selectFrom('node')
    .selectAll()
    .where('project_id', '=', scope.projectId)
    .where('id', 'in', distinct)
    .execute();
  return new Map(rows.map((row) => [row.id, rowToNode(row)]));
}

/**
 * Pair each edge with the node on its far end (target for `out`, source for
 * `in`), batch-loading those nodes in one query to avoid an N+1 fan-out. An
 * external/unresolved far end with no node row yields `null` (ADR-0015 Fork 1).
 */
async function hydrateNeighbors(
  db: Kysely<GraphDatabase>,
  scope: GraphScope,
  edges: readonly Edge[],
  direction: NeighborDirection,
): Promise<Neighbor[]> {
  const farEndId = (edge: Edge): SymbolId => (direction === 'out' ? edge.targetId : edge.sourceId);
  const nodesById = await loadNodes(db, scope, edges.map(farEndId));
  return edges.map((edge) => ({ edge, node: nodesById.get(farEndId(edge)) ?? null }));
}

export async function getFileContentHashes(
  db: Kysely<GraphDatabase>,
  scope: GraphScope,
): Promise<ReadonlyMap<string, string>> {
  const rows = await db
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

export async function getNode(
  db: Kysely<GraphDatabase>,
  scope: GraphScope,
  id: SymbolId,
): Promise<Node | null> {
  const row = await db
    .selectFrom('node')
    .selectAll()
    .where('project_id', '=', scope.projectId)
    .where('id', '=', id)
    .executeTakeFirst();
  return row === undefined ? null : rowToNode(row);
}

export async function neighbors(
  db: Kysely<GraphDatabase>,
  scope: GraphScope,
  id: SymbolId,
  direction: NeighborDirection,
  kind?: EdgeKind,
): Promise<readonly Neighbor[]> {
  let query = db
    .selectFrom('edge')
    .selectAll()
    .where('project_id', '=', scope.projectId)
    .where(anchorColumn(direction), '=', id);
  if (kind !== undefined) {
    query = query.where('kind', '=', kind);
  }
  // Deterministic order so callers and tests see a stable result.
  const edgeRows = await query.orderBy('edge_key').execute();
  return hydrateNeighbors(db, scope, edgeRows.map(rowToEdge), direction);
}

export async function neighborsPage(
  db: Kysely<GraphDatabase>,
  scope: GraphScope,
  id: SymbolId,
  direction: NeighborDirection,
  options?: NeighborPageOptions,
): Promise<Page<Neighbor>> {
  const limit = clampLimit(options?.limit);
  let base = db
    .selectFrom('edge')
    .where('project_id', '=', scope.projectId)
    .where(anchorColumn(direction), '=', id);
  if (options?.kind !== undefined) {
    base = base.where('kind', '=', options.kind);
  }
  const total = await firstPageTotal(options?.cursor, () => countAll(base));
  let page = base.selectAll();
  if (options?.cursor !== undefined) {
    page = page.where('edge_key', '>', String(decodeCursorTuple(options.cursor, 1)[0]));
  }
  const edgeRows = await page
    .orderBy('edge_key')
    .limit(limit + 1)
    .execute();
  const neighborRows = await hydrateNeighbors(db, scope, edgeRows.map(rowToEdge), direction);
  return buildPage(
    neighborRows,
    limit,
    (neighbor) => encodeCursor([edgeIdentityKey(neighbor.edge)]),
    total,
  );
}

export async function blastRadius(
  db: Kysely<GraphDatabase>,
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
  const { rows } = await query.execute(db);
  return rows.map((row) => ({
    nodeId: row.node_id,
    depth: Number(row.depth),
    pathResolution: toPathResolution(row.path_det),
  }));
}

export async function blastRadiusPage(
  db: Kysely<GraphDatabase>,
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

  const rawRows = await runBlastRadiusPage(db, scope, id, kinds, maxDepth, limit, options?.cursor);
  const maxDepthReached = rawRows.length > 0 ? Number(rawRows[0]?.max_depth) : 0;
  const hits: BlastRadiusHit[] = rawRows.map((row) => ({
    nodeId: row.node_id,
    depth: Number(row.depth),
    pathResolution: toPathResolution(row.path_det),
  }));
  const nodesById = await loadNodes(
    db,
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
async function runBlastRadiusPage(
  db: Kysely<GraphDatabase>,
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
  const { rows } = await query.execute(db);
  return rows;
}
