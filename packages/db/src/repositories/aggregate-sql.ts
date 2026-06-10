/**
 * On-read aggregation for the Serve map view (ADR-0015 §3, ADR-0020 Fork 3):
 * roll the graph up to a containment level (package / file / symbol) and project
 * the dependency edges between containers, split by trust (ADR-0015 §8). Views
 * are computed on read here — never stored, never a re-parse.
 *
 * Every query is portable across both backends (ADR-0017 §6): plain joins,
 * `group by`, `count(*)`, `in (…)` over bound parameters, and `<>` — no arrays,
 * no jsonb-only operators. `count(*)` returns a string on Postgres and a number
 * on SQLite, so every count is read through `Number(...)`.
 *
 * A node's container key per level:
 *   - symbol  → the symbol node itself,
 *   - file    → `node.file_id` (the owning file),
 *   - package → the package that `contains` the node's file (one indexed hop).
 * Container ids are bounded by the caller's cap, so the `in (…)` lists stay
 * small and the projections stay cheap.
 */
import type { SymbolId } from '@toopo/core';
import { type Kysely, type Selectable, sql } from 'kysely';
import type { GraphDatabase, NodeTable } from '../schema/graph-types.js';
import { DEFAULT_BLAST_RADIUS_KINDS, type MapEdge, type MapLevel } from './graph.repository.js';

type NodeRow = Selectable<NodeTable>;

/** The dependency edge kinds the map projects — structure (`contains`/`exports`)
 *  is not a dependency, so it is excluded, matching blast-radius (ADR-0015 §8). */
const MAP_EDGE_KINDS = DEFAULT_BLAST_RADIUS_KINDS;

interface ProjectedRow {
  readonly src: string;
  readonly tgt: string;
  readonly res: string;
  readonly c: number | string;
}

/**
 * Select the container nodes at `level`, optionally restricted to a containment
 * `scope`, ordered by id and capped at `limit`. The symbol level always requires
 * a scope (enforced by the caller) so it can never be unbounded.
 */
export function selectContainerRows(
  db: Kysely<GraphDatabase>,
  projectId: string,
  level: MapLevel,
  scope: SymbolId | undefined,
  limit: number,
): Promise<NodeRow[]> {
  if (level === 'package') {
    return db
      .selectFrom('node')
      .selectAll()
      .where('project_id', '=', projectId)
      .where('kind', '=', 'package')
      .orderBy('id')
      .limit(limit)
      .execute();
  }
  if (level === 'file') {
    let query = db
      .selectFrom('node')
      .selectAll()
      .where('project_id', '=', projectId)
      .where('kind', '=', 'file');
    if (scope !== undefined) {
      query = query.where(
        'id',
        'in',
        db
          .selectFrom('edge')
          .select('target_id')
          .where('project_id', '=', projectId)
          .where('source_id', '=', scope)
          .where('kind', '=', 'contains'),
      );
    }
    return query.orderBy('id').limit(limit).execute();
  }
  return db
    .selectFrom('node')
    .selectAll()
    .where('project_id', '=', projectId)
    .where('kind', '=', 'symbol')
    .where('file_id', '=', scope ?? '')
    .orderBy('id')
    .limit(limit)
    .execute();
}

/** Count the symbols each container holds (for UI sizing), keyed by container id. */
export async function selectChildCounts(
  db: Kysely<GraphDatabase>,
  projectId: string,
  level: MapLevel,
  ids: readonly SymbolId[],
): Promise<Map<SymbolId, number>> {
  if (ids.length === 0) {
    return new Map();
  }
  const idList = sql.join(ids.map((id) => sql`${id}`));
  const query = childCountQuery(level, idList, projectId);
  const { rows } = await query.execute(db);
  return new Map(rows.map((row) => [row.gid, Number(row.c)]));
}

function childCountQuery(level: MapLevel, idList: ReturnType<typeof sql.join>, projectId: string) {
  if (level === 'package') {
    // Symbols under a package: symbol.file_id → file, contained by the package.
    return sql<{ gid: string; c: number | string }>`
      select "pc"."source_id" as "gid", count(distinct "n"."id") as "c"
      from "node" as "n"
      join "edge" as "pc" on "pc"."target_id" = "n"."file_id" and "pc"."kind" = 'contains' and "pc"."project_id" = ${projectId}
      where "n"."kind" = 'symbol' and "n"."project_id" = ${projectId} and "pc"."source_id" in (${idList})
      group by "pc"."source_id"`;
  }
  if (level === 'file') {
    return sql<{ gid: string; c: number | string }>`
      select "file_id" as "gid", count(*) as "c"
      from "node" where "kind" = 'symbol' and "project_id" = ${projectId} and "file_id" in (${idList})
      group by "file_id"`;
  }
  return sql<{ gid: string; c: number | string }>`
    select "source_id" as "gid", count(*) as "c"
    from "edge" where "kind" = 'contains' and "project_id" = ${projectId} and "source_id" in (${idList})
    group by "source_id"`;
}

/** Project dependency edges between the given containers, folded into trust counts. */
export async function selectProjectedEdges(
  db: Kysely<GraphDatabase>,
  projectId: string,
  level: MapLevel,
  ids: readonly SymbolId[],
): Promise<MapEdge[]> {
  if (ids.length === 0) {
    return [];
  }
  const idList = sql.join(ids.map((id) => sql`${id}`));
  const kindList = sql.join(MAP_EDGE_KINDS.map((kind) => sql`${kind}`));
  const query = projectedEdgeQuery(level, idList, kindList, projectId);
  const { rows } = await query.execute(db);
  return foldTrust(rows);
}

function projectedEdgeQuery(
  level: MapLevel,
  idList: ReturnType<typeof sql.join>,
  kindList: ReturnType<typeof sql.join>,
  projectId: string,
) {
  if (level === 'symbol') {
    return sql<ProjectedRow>`
      select "e"."source_id" as "src", "e"."target_id" as "tgt", "e"."resolution" as "res", count(*) as "c"
      from "edge" as "e"
      where "e"."kind" in (${kindList}) and "e"."project_id" = ${projectId}
        and "e"."source_id" in (${idList}) and "e"."target_id" in (${idList})
        and "e"."source_id" <> "e"."target_id"
      group by "e"."source_id", "e"."target_id", "e"."resolution"`;
  }
  if (level === 'file') {
    return sql<ProjectedRow>`
      select "ns"."file_id" as "src", "nt"."file_id" as "tgt", "e"."resolution" as "res", count(*) as "c"
      from "edge" as "e"
      join "node" as "ns" on "ns"."id" = "e"."source_id" and "ns"."project_id" = ${projectId}
      join "node" as "nt" on "nt"."id" = "e"."target_id" and "nt"."project_id" = ${projectId}
      where "e"."kind" in (${kindList}) and "e"."project_id" = ${projectId}
        and "ns"."file_id" in (${idList}) and "nt"."file_id" in (${idList})
        and "ns"."file_id" <> "nt"."file_id"
      group by "ns"."file_id", "nt"."file_id", "e"."resolution"`;
  }
  return sql<ProjectedRow>`
    select "sp"."source_id" as "src", "tp"."source_id" as "tgt", "e"."resolution" as "res", count(*) as "c"
    from "edge" as "e"
    join "node" as "ns" on "ns"."id" = "e"."source_id" and "ns"."project_id" = ${projectId}
    join "node" as "nt" on "nt"."id" = "e"."target_id" and "nt"."project_id" = ${projectId}
    join "edge" as "sp" on "sp"."target_id" = "ns"."file_id" and "sp"."kind" = 'contains' and "sp"."project_id" = ${projectId}
    join "edge" as "tp" on "tp"."target_id" = "nt"."file_id" and "tp"."kind" = 'contains' and "tp"."project_id" = ${projectId}
    where "e"."kind" in (${kindList}) and "e"."project_id" = ${projectId}
      and "sp"."source_id" in (${idList}) and "tp"."source_id" in (${idList})
      and "sp"."source_id" <> "tp"."source_id"
    group by "sp"."source_id", "tp"."source_id", "e"."resolution"`;
}

/** Fold per-resolution count rows into one trust-split {@link MapEdge} per pair. */
function foldTrust(rows: readonly ProjectedRow[]): MapEdge[] {
  const byPair = new Map<
    string,
    { sourceId: string; targetId: string; deterministic: number; inferred: number }
  >();
  for (const row of rows) {
    const key = `${row.src}${row.tgt}`;
    // U+001F (Unit Separator) never occurs in a SymbolId, so the joined pair key
    // is unambiguous — the same guarantee the blast-radius path delimiter uses.
    const entry = byPair.get(key) ?? {
      sourceId: row.src,
      targetId: row.tgt,
      deterministic: 0,
      inferred: 0,
    };
    const count = Number(row.c);
    if (row.res === 'deterministic') {
      entry.deterministic += count;
    } else {
      entry.inferred += count;
    }
    byPair.set(key, entry);
  }
  // Deterministic output order so views and tests are stable.
  return [...byPair.values()].sort(
    (a, b) => a.sourceId.localeCompare(b.sourceId) || a.targetId.localeCompare(b.targetId),
  );
}
