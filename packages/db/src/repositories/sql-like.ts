/**
 * Portable LIKE-escaping (ADR-0017 §6), shared by the blast-radius cycle guard
 * and the Serve name/path search. A user- or identifier-supplied operand may
 * contain the LIKE wildcards `%` and `_`; left raw they would match more than
 * the literal text. We neutralize them SQL-side with `replace()` and an explicit
 * `ESCAPE` character, so the predicate stays a literal substring match.
 *
 * Every construct (`replace`, `||`, `like … escape`) is identical on
 * libSQL-SQLite ≥3.38 and Postgres, so the same builder serves both backends.
 */
import { type RawBuilder, sql } from 'kysely';

/** The LIKE escape character used to neutralize `%`/`_` (and itself) in operands. */
export const LIKE_ESCAPE = '\\';

/**
 * Escape the LIKE escape char first, then the two wildcards, in `operand` — a
 * column reference or a bound value. The result is meant to sit inside a
 * `like … escape '\'` predicate, matching the operand's text literally.
 */
export function escapeLikeOperand(operand: RawBuilder<unknown>): RawBuilder<string> {
  const esc = LIKE_ESCAPE;
  return sql<string>`replace(replace(replace(${operand}, ${esc}, ${esc} || ${esc}), '%', ${esc} || '%'), '_', ${esc} || '_')`;
}
