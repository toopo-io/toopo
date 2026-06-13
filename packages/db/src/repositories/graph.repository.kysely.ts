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
  type UnresolvedReference,
} from '@toopo/core';
import {
  type Insertable,
  type Kysely,
  type RawBuilder,
  type Selectable,
  type SelectQueryBuilder,
  type SqlBool,
  sql,
} from 'kysely';
import type {
  EdgeTable,
  GraphDatabase,
  NodeTable,
  UnresolvedReferenceTable,
} from '../schema/graph-types.js';
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
  type DependencyEdge,
  type GraphRepository,
  type MapView,
  type MapViewOptions,
  type Neighbor,
  type NeighborDirection,
  type NeighborPageOptions,
  type PathResolution,
  type PersistGraphResult,
  type SearchOptions,
  type UnresolvedReferenceOptions,
  type UnusedSymbol,
} from './graph.repository.js';
import {
  buildPage,
  clampLimit,
  decodeCursorTuple,
  encodeCursor,
  firstPageTotal,
  numberCursorPart,
  type Page,
  type PageOptions,
} from './graph-page.js';
import {
  edgeToInsert,
  nodeToInsert,
  rowToEdge,
  rowToNode,
  rowToUnresolvedReference,
  unresolvedReferenceKey,
  unresolvedReferenceToInsert,
} from './graph-records.js';
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

/** Coerce a `count(*)` row to a number (driver count types vary: number/string/bigint). */
function rowCount(row: { count?: number | string | bigint } | undefined): number {
  return Number(row?.count ?? 0);
}

/** The edge column anchored to the queried node: source for forward, target for reverse. */
function anchorColumn(direction: NeighborDirection): 'source_id' | 'target_id' {
  return direction === 'out' ? 'source_id' : 'target_id';
}

export class KyselyGraphRepository implements GraphRepository {
  constructor(private readonly db: Kysely<GraphDatabase>) {}

  /**
   * Count the rows a filtered query matches (D9 page `total`). The caller passes
   * the query with its WHERE filters applied but NO keyset/limit, so the count
   * covers the whole result. The generic accepts both plain and aliased-join
   * builders (the `DB` type a join augments with its aliases), so every read uses
   * this single counting path. Driver count types vary (number/string/bigint), so
   * the result is coerced.
   */
  private async countAll<DB, TB extends keyof DB>(
    query: SelectQueryBuilder<DB, TB, object>,
  ): Promise<number> {
    return rowCount(await query.select((eb) => eb.fn.countAll().as('count')).executeTakeFirst());
  }

  async persistGraph(
    scope: GraphScope,
    document: GraphDocument,
    unresolvedReferences: readonly UnresolvedReference[] = [],
  ): Promise<PersistGraphResult> {
    const { nodeRows, edgeRows } = buildDocumentRows(scope, document);
    const refRows = buildUnresolvedReferenceRows(scope, unresolvedReferences);
    await this.db.transaction().execute(async (trx) => {
      await writeDocumentRows(trx, nodeRows, edgeRows);
      await writeUnresolvedReferenceRows(trx, refRows);
    });
    return { nodes: nodeRows.length, edges: edgeRows.length };
  }

  async replaceProjectGraph(
    scope: GraphScope,
    document: GraphDocument,
    unresolvedReferences: readonly UnresolvedReference[] = [],
  ): Promise<PersistGraphResult> {
    const { nodeRows, edgeRows } = buildDocumentRows(scope, document);
    const refRows = buildUnresolvedReferenceRows(scope, unresolvedReferences);
    await this.db.transaction().execute(async (trx) => {
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
    let base = this.db
      .selectFrom('edge')
      .where('project_id', '=', scope.projectId)
      .where(anchorColumn(direction), '=', id);
    if (options?.kind !== undefined) {
      base = base.where('kind', '=', options.kind);
    }
    const total = await firstPageTotal(options?.cursor, () => this.countAll(base));
    let page = base.selectAll();
    if (options?.cursor !== undefined) {
      page = page.where('edge_key', '>', String(decodeCursorTuple(options.cursor, 1)[0]));
    }
    const edgeRows = await page
      .orderBy('edge_key')
      .limit(limit + 1)
      .execute();
    const neighbors = await this.hydrateNeighbors(scope, edgeRows.map(rowToEdge), direction);
    return buildPage(
      neighbors,
      limit,
      (neighbor) => encodeCursor([edgeIdentityKey(neighbor.edge)]),
      total,
    );
  }

  async search(scope: GraphScope, options?: SearchOptions): Promise<Page<Node>> {
    const limit = clampLimit(options?.limit);
    let base = this.db.selectFrom('node').where('project_id', '=', scope.projectId);
    if (options?.kind !== undefined) {
      base = base.where('kind', '=', options.kind);
    }
    if (options?.subKind !== undefined) {
      base = base.where('sub_kind', '=', options.subKind);
    }
    if (options?.query !== undefined && options.query.length > 0) {
      base = base.where(nameOrPathMatches(options.query));
    }
    const total = await firstPageTotal(options?.cursor, () => this.countAll(base));
    let page = base.selectAll();
    if (options?.cursor !== undefined) {
      page = page.where('id', '>', String(decodeCursorTuple(options.cursor, 1)[0]));
    }
    const rows = await page
      .orderBy('id')
      .limit(limit + 1)
      .execute();
    return buildPage(rows.map(rowToNode), limit, (node) => encodeCursor([node.id]), total);
  }

  async declaredInterface(
    scope: GraphScope,
    id: SymbolId,
    options?: PageOptions,
  ): Promise<Page<Node>> {
    const limit = clampLimit(options?.limit);
    // Both sides are scoped: the contains edge AND the contained node, so a
    // colliding id in another project can never join in (ADR-0022 §3).
    const base = this.db
      .selectFrom('edge as c')
      .innerJoin('node as n', 'n.id', 'c.target_id')
      .where('c.project_id', '=', scope.projectId)
      .where('n.project_id', '=', scope.projectId)
      .where('c.source_id', '=', id)
      .where('c.kind', '=', 'contains')
      .where('n.kind', '=', 'symbol');
    const total = await firstPageTotal(options?.cursor, () => this.countAll(base));
    let page = base.selectAll('n');
    if (options?.cursor !== undefined) {
      page = page.where('n.id', '>', String(decodeCursorTuple(options.cursor, 1)[0]));
    }
    const rows = await page
      .orderBy('n.id')
      .limit(limit + 1)
      .execute();
    return buildPage(rows.map(rowToNode), limit, (node) => encodeCursor([node.id]), total);
  }

  async containedDeclarations(
    scope: GraphScope,
    id: SymbolId,
    options?: PageOptions,
  ): Promise<Page<Node>> {
    const limit = clampLimit(options?.limit);
    // Both sides scoped (ADR-0022 §3). Exclude call-sites — they are statements,
    // not declarations (served by callSitesOf); every other contained kind is a
    // declaration (a package's files, a file's symbols, a symbol's members).
    const base = this.db
      .selectFrom('edge as c')
      .innerJoin('node as n', 'n.id', 'c.target_id')
      .where('c.project_id', '=', scope.projectId)
      .where('n.project_id', '=', scope.projectId)
      .where('c.source_id', '=', id)
      .where('c.kind', '=', 'contains')
      .where('n.kind', '!=', 'callSite');
    const total = await firstPageTotal(options?.cursor, () => this.countAll(base));
    let page = base.selectAll('n');
    if (options?.cursor !== undefined) {
      page = page.where('n.id', '>', String(decodeCursorTuple(options.cursor, 1)[0]));
    }
    const rows = await page
      .orderBy('n.id')
      .limit(limit + 1)
      .execute();
    return buildPage(rows.map(rowToNode), limit, (node) => encodeCursor([node.id]), total);
  }

  async callSitesOf(scope: GraphScope, id: SymbolId, options?: PageOptions): Promise<Page<Node>> {
    const limit = clampLimit(options?.limit);
    const base = this.db
      .selectFrom('node')
      .where('project_id', '=', scope.projectId)
      .where('enclosing_symbol_id', '=', id)
      .where('kind', '=', 'callSite');
    const total = await firstPageTotal(options?.cursor, () => this.countAll(base));
    let page = base.selectAll();
    if (options?.cursor !== undefined) {
      page = page.where('id', '>', String(decodeCursorTuple(options.cursor, 1)[0]));
    }
    const rows = await page
      .orderBy('id')
      .limit(limit + 1)
      .execute();
    return buildPage(rows.map(rowToNode), limit, (node) => encodeCursor([node.id]), total);
  }

  async unresolvedReferences(
    scope: GraphScope,
    options?: UnresolvedReferenceOptions,
  ): Promise<Page<UnresolvedReference>> {
    const limit = clampLimit(options?.limit);
    // An empty code-family filter matches nothing — short-circuit (and avoid an
    // empty `in ()`, which is not portable SQL). First page carries total 0.
    if (options?.codes !== undefined && options.codes.length === 0) {
      return { items: [], nextCursor: null, ...(options.cursor === undefined ? { total: 0 } : {}) };
    }
    let base = this.db.selectFrom('unresolved_reference').where('project_id', '=', scope.projectId);
    if (options?.targetFileId !== undefined) {
      base = base.where('target_file_id', '=', options.targetFileId);
    }
    if (options?.codes !== undefined) {
      base = base.where('code', 'in', options.codes);
    }
    const total = await firstPageTotal(options?.cursor, () => this.countAll(base));
    let page = base.selectAll();
    if (options?.cursor !== undefined) {
      page = page.where('ref_key', '>', String(decodeCursorTuple(options.cursor, 1)[0]));
    }
    const rows = await page
      .orderBy('ref_key')
      .limit(limit + 1)
      .execute();
    return buildPage(
      rows.map(rowToUnresolvedReference),
      limit,
      (reference) => encodeCursor([unresolvedReferenceKey(reference)]),
      total,
    );
  }

  /**
   * The top-level-symbol base (ADR-0029 §2): a `symbol` reached by a `contains`
   * edge from its OWN file (`source_id = file_id`), so nested symbols, params,
   * props and call-sites are excluded. The predicate lives once here, shared by
   * the collision count, the collision page and (later) the unused view, and both
   * sides are project-scoped (ADR-0022 §3).
   */
  private topLevelSymbols(scope: GraphScope) {
    return this.db
      .selectFrom('node as n')
      .where('n.project_id', '=', scope.projectId)
      .where('n.kind', '=', 'symbol')
      .where('n.name', 'is not', null)
      .where((eb) =>
        eb.exists(
          eb
            .selectFrom('edge as ce')
            .select(sql.lit(1).as('one'))
            .where('ce.project_id', '=', scope.projectId)
            .where('ce.kind', '=', 'contains')
            .whereRef('ce.target_id', '=', 'n.id')
            .whereRef('ce.source_id', '=', 'n.file_id'),
        ),
      );
  }

  async nameCollisions(scope: GraphScope, options?: PageOptions): Promise<Page<Node>> {
    const limit = clampLimit(options?.limit);
    // Names shared by ≥ 2 top-level symbols — computed with the SAME top-level
    // predicate as the page, so the collision set and the rows can never disagree.
    const collidingNames = this.topLevelSymbols(scope)
      .select('n.name')
      .groupBy('n.name')
      .having((eb) => eb(eb.fn.count('n.id'), '>', 1));
    const base = this.topLevelSymbols(scope).where('n.name', 'in', collidingNames);
    const total = await firstPageTotal(options?.cursor, () => this.countAll(base));
    let page = base.selectAll('n');
    if (options?.cursor !== undefined) {
      // Composite keyset on (name, id): the stable order that groups by name.
      const [name, id] = decodeCursorTuple(options.cursor, 2);
      page = page.where((eb) =>
        eb.or([
          eb('n.name', '>', String(name)),
          eb.and([eb('n.name', '=', String(name)), eb('n.id', '>', String(id))]),
        ]),
      );
    }
    const rows = await page
      .orderBy('n.name')
      .orderBy('n.id')
      .limit(limit + 1)
      .execute();
    return buildPage(
      rows.map(rowToNode),
      limit,
      (node) => encodeCursor([collisionName(node), node.id]),
      total,
    );
  }

  async unusedSymbols(scope: GraphScope, options?: PageOptions): Promise<Page<UnusedSymbol>> {
    const limit = clampLimit(options?.limit);
    const projectId = scope.projectId;
    // Top-level symbols with NO incoming usage edge (the dependency kinds, never
    // contains/exports). `extends`/`implements`/`imports` count as usage so a
    // depended-upon symbol is never asserted unused (the trust direction, ADR-0029).
    const base = this.topLevelSymbols(scope).where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom('edge as ue')
            .select(sql.lit(1).as('one'))
            .where('ue.project_id', '=', projectId)
            .where('ue.kind', 'in', DEFAULT_BLAST_RADIUS_KINDS)
            .whereRef('ue.target_id', '=', 'n.id'),
        ),
      ),
    );
    const total = await firstPageTotal(options?.cursor, () => this.countAll(base));
    let page = base
      .selectAll('n')
      .select([
        candidateFlagSql(projectId).as('candidate_flag'),
        exportedFlagSql(projectId).as('exported_flag'),
      ]);
    if (options?.cursor !== undefined) {
      page = page.where('n.id', '>', String(decodeCursorTuple(options.cursor, 1)[0]));
    }
    const rows = await page
      .orderBy('n.id')
      .limit(limit + 1)
      .execute();
    return buildPage(
      rows.map(rowToUnusedSymbol),
      limit,
      (row) => encodeCursor([row.node.id]),
      total,
    );
  }

  async cyclicDependencyEdges(
    scope: GraphScope,
    options?: PageOptions,
  ): Promise<Page<DependencyEdge>> {
    const limit = clampLimit(options?.limit);
    const projectId = scope.projectId;
    // The induced cycle-candidate subgraph: a dependency edge survives only if its
    // source has an incoming and its target an outgoing dependency edge (necessary
    // for cycle membership; never drops a real cyclic edge). Serve runs Tarjan.
    let page = this.db
      .selectFrom('edge as e')
      .where('e.project_id', '=', projectId)
      .where('e.kind', 'in', DEFAULT_BLAST_RADIUS_KINDS)
      .where((eb) =>
        eb.exists(
          eb
            .selectFrom('edge as ie')
            .select(sql.lit(1).as('one'))
            .where('ie.project_id', '=', projectId)
            .where('ie.kind', 'in', DEFAULT_BLAST_RADIUS_KINDS)
            .whereRef('ie.target_id', '=', 'e.source_id'),
        ),
      )
      .where((eb) =>
        eb.exists(
          eb
            .selectFrom('edge as oe')
            .select(sql.lit(1).as('one'))
            .where('oe.project_id', '=', projectId)
            .where('oe.kind', 'in', DEFAULT_BLAST_RADIUS_KINDS)
            .whereRef('oe.source_id', '=', 'e.target_id'),
        ),
      )
      .select([
        'e.edge_key as key',
        'e.source_id as sourceId',
        'e.target_id as targetId',
        'e.resolution',
      ]);
    if (options?.cursor !== undefined) {
      page = page.where('e.edge_key', '>', String(decodeCursorTuple(options.cursor, 1)[0]));
    }
    const rows = await page
      .orderBy('e.edge_key')
      .limit(limit + 1)
      .execute();
    return buildPage(
      rows.map(rowToDependencyEdge),
      limit,
      (edge) => encodeCursor([edge.key]),
      undefined,
    );
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

/**
 * The name component of a collision keyset cursor. `nameCollisions` yields only
 * top-level symbols (which carry a name), so the union-narrowing fallback is
 * unreachable; it keeps the cursor key type-safe over the full Node union.
 */
function collisionName(node: Node): string {
  if (node.kind === 'symbol' && node.name !== null) {
    return node.name;
  }
  // nameCollisions yields only named top-level symbols; a miss is a broken
  // invariant — fail loud rather than emit a silently wrong keyset cursor.
  throw new Error(`nameCollisions cursor: expected a named symbol, got "${node.kind}"`);
}

/**
 * D6 classification (ADR-0029): 1 when an unresolved usage could still reach the
 * top-level symbol `n` — an `unresolved-member` anchored to its file+name, or an
 * `unbound-callee` by name — so it is a *candidate* (possibly-used), never
 * asserted unused. Anchored gaps exonerate precisely; anchorless ones by name.
 */
function candidateFlagSql(projectId: string): RawBuilder<number> {
  return sql<number>`(case when exists(
      select 1 from "unresolved_reference" as "um"
        where "um"."project_id" = ${projectId}
          and "um"."code" = 'unresolved-member'
          and "um"."target_file_id" = "n"."file_id"
          and "um"."name" = "n"."name"
    ) or exists(
      select 1 from "unresolved_reference" as "uc"
        where "uc"."project_id" = ${projectId}
          and "uc"."code" = 'unbound-callee'
          and "uc"."name" = "n"."name"
    ) then 1 else 0 end)`;
}

/** D6 export fact (ADR-0029): 1 when `n` is exported from its file (a `file
 *  ─exports→ symbol` edge). A displayed fact, not a verdict — the reader tells
 *  public-API-with-no-internal-usage from likely-dead; we never assert "dead". */
function exportedFlagSql(projectId: string): RawBuilder<number> {
  return sql<number>`(case when exists(
      select 1 from "edge" as "xe"
        where "xe"."project_id" = ${projectId}
          and "xe"."kind" = 'exports'
          and "xe"."target_id" = "n"."id"
    ) then 1 else 0 end)`;
}

/** Map a D6 row (node columns + the two integer flags) to an {@link UnusedSymbol};
 *  the flags arrive as a number or driver-stringified integer, so they are coerced. */
function rowToUnusedSymbol(
  row: Selectable<NodeTable> & { candidate_flag: number; exported_flag: number },
): UnusedSymbol {
  return {
    node: rowToNode(row),
    candidate: Number(row.candidate_flag) !== 0,
    exported: Number(row.exported_flag) !== 0,
  };
}

/** Map a D7 cycle-candidate edge row to a {@link DependencyEdge}; `resolution` is
 *  text in storage, narrowed to its trust literal (anything but `inferred` is
 *  proven, matching the edge model's closed set). */
function rowToDependencyEdge(row: {
  key: string;
  sourceId: string;
  targetId: string;
  resolution: string;
}): DependencyEdge {
  return {
    key: row.key,
    sourceId: row.sourceId,
    targetId: row.targetId,
    resolution: row.resolution === 'inferred' ? 'inferred' : 'deterministic',
  };
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
  // The depth slot must hold the number the server encoded — a forged string
  // there is a 400 (InvalidCursorError), never a NaN bind parameter.
  const depth = numberCursorPart(depthPart, cursor);
  const nodeId = String(nodePart);
  return sql`where ("depth" > ${depth} or ("depth" = ${depth} and "node_id" > ${nodeId}))`;
}
