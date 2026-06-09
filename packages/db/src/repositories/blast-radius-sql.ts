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

/** The visited-path delimiter — ASCII Unit Separator (0x1F), never present in a
 *  SymbolId (tree-sitter emits no control characters in identifier text). */
export const BLAST_PATH_SEPARATOR = String.fromCharCode(31);

export interface BlastRadiusCteParams {
  readonly startId: string;
  readonly kinds: readonly string[];
  readonly maxDepth: number;
}

/**
 * Build the `with recursive blast(node_id, depth, path) as (...)` clause. The
 * caller appends a final `select ... from blast where depth > 0`. Requires a
 * non-empty `kinds` (an empty `in ()` is invalid SQL — callers short-circuit).
 */
export function blastRadiusCte(params: BlastRadiusCteParams): RawBuilder<unknown> {
  const sep = BLAST_PATH_SEPARATOR;
  const esc = LIKE_ESCAPE;
  const kindList = sql.join(params.kinds.map((kind) => sql`${kind}`));
  const escapedSource = escapeLikeOperand(sql`"e"."source_id"`);

  return sql`
    with recursive "blast"("node_id", "depth", "path") as (
      select cast(${params.startId} as text), 0, ${sep} || ${params.startId} || ${sep}
      union all
      select "e"."source_id", "b"."depth" + 1, "b"."path" || "e"."source_id" || ${sep}
      from "blast" as "b"
      join "edge" as "e" on "e"."target_id" = "b"."node_id"
      where "b"."depth" < ${params.maxDepth}
        and "e"."kind" in (${kindList})
        and "b"."path" not like
          '%' || ${sep} || ${escapedSource} || ${sep} || '%' escape ${esc}
    )`;
}
