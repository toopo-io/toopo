/**
 * The portable blast-radius recursive CTE (ADR-0017 §6), factored out so the
 * production query (grouped hits) and the dogfood perf probe (raw row count)
 * build on the identical traversal.
 *
 * Reverse-reachability over forward edges: starting at `startId`, follow edges
 * whose TARGET is the current node and emit their SOURCE, one level deeper.
 * Cycle safety is a visited-path string plus a depth cap — never Postgres's
 * CYCLE/SEARCH, which libSQL lacks. The path delimiter is bound as the parameter
 * `\x1F` (ASCII Unit Separator): tree-sitter never emits control characters in
 * identifier text, so it cannot occur inside a SymbolId, making each delimited
 * token unambiguous. LIKE wildcards in the candidate id are escaped SQL-side via
 * portable `replace()` + `ESCAPE`, so a `%`/`_` in an id cannot cause a false
 * "already visited" prune. Every construct (`||`, `replace`, `like … escape`,
 * `cast … as text`) is identical on libSQL-SQLite ≥3.38 and Postgres.
 */
import { type RawBuilder, sql } from 'kysely';
import { escapeLikeOperand, LIKE_ESCAPE } from './sql-like.js';
import { UNIT_SEPARATOR } from './unit-separator.js';

/** The visited-path delimiter — the shared {@link UNIT_SEPARATOR}. */
export const BLAST_PATH_SEPARATOR = UNIT_SEPARATOR;

export interface BlastRadiusCteParams {
  /** The tenancy scope (ADR-0022 §3): every traversed edge is bound to it. */
  readonly projectId: string;
  readonly startId: string;
  readonly kinds: readonly string[];
  readonly maxDepth: number;
}

/**
 * Build the `with recursive blast(node_id, depth, path, path_det) as (...)`
 * clause. The caller appends a final `select ... from blast where depth > 0`,
 * grouping by `node_id` with `min(depth)` for proximity and `max(path_det)` for
 * trust. Requires a non-empty `kinds` (an empty `in ()` is invalid SQL — callers
 * short-circuit).
 *
 * `path_det` (ADR-0021) tracks per-path determinism as an INTEGER 0/1: the anchor
 * is `1` (a zero-length path is trivially proven), and each recursive step
 * multiplies by `1` for a deterministic edge or `0` for an inferred one — so it
 * stays `1` only while every edge traversed is deterministic. Integer
 * multiplication with a `case` is used instead of a boolean `AND` because
 * Postgres will not coerce an integer to boolean for a logical `AND`, whereas
 * `*` and `case` are byte-identical on libSQL-SQLite ≥3.38 and Postgres
 * (ADR-0017 §6). At the final `group by`, `max(path_det)` is 1 iff ANY
 * fully-deterministic path reaches the node — the "certainly impacted" predicate.
 */
export function blastRadiusCte(params: BlastRadiusCteParams): RawBuilder<unknown> {
  const sep = BLAST_PATH_SEPARATOR;
  const esc = LIKE_ESCAPE;
  const kindList = sql.join(params.kinds.map((kind) => sql`${kind}`));
  const escapedSource = escapeLikeOperand(sql`"e"."source_id"`);

  return sql`
    with recursive "blast"("node_id", "depth", "path", "path_det") as (
      select cast(${params.startId} as text), 0, ${sep} || ${params.startId} || ${sep}, 1
      union all
      select "e"."source_id", "b"."depth" + 1, "b"."path" || "e"."source_id" || ${sep},
        "b"."path_det" * (case when "e"."resolution" = 'deterministic' then 1 else 0 end)
      from "blast" as "b"
      join "edge" as "e" on "e"."target_id" = "b"."node_id" and "e"."project_id" = ${params.projectId}
      where "b"."depth" < ${params.maxDepth}
        and "e"."kind" in (${kindList})
        and "b"."path" not like
          '%' || ${sep} || ${escapedSource} || ${sep} || '%' escape ${esc}
    )`;
}
