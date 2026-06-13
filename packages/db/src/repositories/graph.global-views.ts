/**
 * Deterministic global derived views for the Kysely repository (ADR-0029): D5
 * name collisions, D6 unused symbols, D7 cyclic-dependency candidate edges. All
 * share one top-level-symbol predicate and the one usage edge-set
 * (`DEFAULT_BLAST_RADIUS_KINDS`); every read is project-scoped (ADR-0022 §3).
 */
import type { Node } from '@toopo/core';
import type { Kysely } from 'kysely';
import { type RawBuilder, type Selectable, sql } from 'kysely';
import type { GraphDatabase, NodeTable } from '../schema/graph-types.js';
import { countAll } from './graph.query-helpers.js';
import {
  DEFAULT_BLAST_RADIUS_KINDS,
  type DependencyEdge,
  type UnusedSymbol,
} from './graph.repository.js';
import {
  buildPage,
  clampLimit,
  decodeCursorTuple,
  encodeCursor,
  firstPageTotal,
  type Page,
  type PageOptions,
} from './graph-page.js';
import { rowToNode } from './graph-records.js';
import type { GraphScope } from './graph-scope.js';

/**
 * The top-level-symbol base (ADR-0029 §2): a `symbol` reached by a `contains`
 * edge from its OWN file (`source_id = file_id`), so nested symbols, params,
 * props and call-sites are excluded. The predicate lives once here, shared by
 * the collision count, the collision page and the unused view, and both sides
 * are project-scoped (ADR-0022 §3).
 */
function topLevelSymbols(db: Kysely<GraphDatabase>, scope: GraphScope) {
  return db
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

export async function nameCollisions(
  db: Kysely<GraphDatabase>,
  scope: GraphScope,
  options?: PageOptions,
): Promise<Page<Node>> {
  const limit = clampLimit(options?.limit);
  // Names shared by ≥ 2 top-level symbols — computed with the SAME top-level
  // predicate as the page, so the collision set and the rows can never disagree.
  const collidingNames = topLevelSymbols(db, scope)
    .select('n.name')
    .groupBy('n.name')
    .having((eb) => eb(eb.fn.count('n.id'), '>', 1));
  const base = topLevelSymbols(db, scope).where('n.name', 'in', collidingNames);
  const total = await firstPageTotal(options?.cursor, () => countAll(base));
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

export async function unusedSymbols(
  db: Kysely<GraphDatabase>,
  scope: GraphScope,
  options?: PageOptions,
): Promise<Page<UnusedSymbol>> {
  const limit = clampLimit(options?.limit);
  const projectId = scope.projectId;
  // Top-level symbols with NO incoming usage edge (the dependency kinds, never
  // contains/exports). `extends`/`implements`/`imports` count as usage so a
  // depended-upon symbol is never asserted unused (the trust direction, ADR-0029).
  const base = topLevelSymbols(db, scope).where((eb) =>
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
  const total = await firstPageTotal(options?.cursor, () => countAll(base));
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
  return buildPage(rows.map(rowToUnusedSymbol), limit, (row) => encodeCursor([row.node.id]), total);
}

export async function cyclicDependencyEdges(
  db: Kysely<GraphDatabase>,
  scope: GraphScope,
  options?: PageOptions,
): Promise<Page<DependencyEdge>> {
  const limit = clampLimit(options?.limit);
  const projectId = scope.projectId;
  // The induced cycle-candidate subgraph: a dependency edge survives only if its
  // source has an incoming and its target an outgoing dependency edge. This is a
  // necessary (not sufficient) condition for cycle membership — sound (no real
  // cyclic edge is ever dropped) but not complete (non-cyclic edges can pass).
  // Serve runs Tarjan over the survivors to keep only true SCCs (ADR-0029 D7).
  let page = db
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
