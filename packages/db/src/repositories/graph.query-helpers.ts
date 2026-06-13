/**
 * Cross-cutting read helpers for the Kysely graph repository: the filtered-count
 * primitive every paginated read uses for its first-page `total`. Kept here (not
 * in any one domain file) because the core-reads, serve-reads and global-views
 * modules all build on it.
 */
import type { SelectQueryBuilder } from 'kysely';

/** Coerce a `count(*)` row to a number (driver count types vary: number/string/bigint). */
export function rowCount(row: { count?: number | string | bigint } | undefined): number {
  return Number(row?.count ?? 0);
}

/**
 * Count the rows a filtered query matches (D9 page `total`). The caller passes
 * the query with its WHERE filters applied but NO keyset/limit, so the count
 * covers the whole result. The generic accepts both plain and aliased-join
 * builders (the `DB` type a join augments with its aliases), so every read uses
 * this single counting path. Driver count types vary (number/string/bigint), so
 * the result is coerced.
 */
export async function countAll<DB, TB extends keyof DB>(
  query: SelectQueryBuilder<DB, TB, object>,
): Promise<number> {
  return rowCount(await query.select((eb) => eb.fn.countAll().as('count')).executeTakeFirst());
}
