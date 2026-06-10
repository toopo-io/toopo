/**
 * Keyset (cursor) pagination primitives for the Serve read layer (ADR-0020 Fork
 * 4). Every list query is bounded: it over-fetches `limit + 1` rows ordered by a
 * stable key, returns the first `limit`, and emits an opaque `nextCursor` built
 * from the last returned row's key — never offset pagination, which drifts and
 * scans on large graphs.
 *
 * The cursor is an opaque base64url blob over the ordering key tuple. It is
 * untrusted input on the way back in (a client may forge it), so `decodeCursor`
 * validates structurally and throws {@link InvalidCursorError} rather than
 * returning a malformed tuple — the boundary-validation discipline (ADR-0006).
 */

/** Page size when the caller does not specify one. */
export const DEFAULT_PAGE_LIMIT = 50;

/** Hard ceiling on page size, so a caller cannot request an unbounded page. */
export const MAX_PAGE_LIMIT = 200;

/** One bounded page of results plus the cursor to fetch the next one (or null). */
export interface Page<T> {
  readonly items: readonly T[];
  /** Opaque cursor for the next page, or `null` when this is the last page. */
  readonly nextCursor: string | null;
  /**
   * Total count of items matching the query across all pages (ADR-0020 Fork 4,
   * D9). Computed once on the FIRST page (no cursor) so a single round-trip sizes
   * the whole result, and omitted on later pages (the count cannot drift mid-walk
   * and a repeat count would be wasted work). Keyset paging never needs it to
   * function — it is a UI affordance ("N results"), so it stays optional.
   */
  readonly total?: number;
}

/**
 * Cursor + limit inputs shared by every paginated read. The fields admit
 * `undefined` (not just absence) so callers can forward optional values straight
 * through under `exactOptionalPropertyTypes`.
 */
export interface PageOptions {
  /** Requested page size; clamped to `[1, MAX_PAGE_LIMIT]` (defaults applied). */
  readonly limit?: number | undefined;
  /** Opaque cursor from a previous page's `nextCursor`; absent on the first page. */
  readonly cursor?: string | undefined;
}

/** A single component of an ordering-key tuple encoded into a cursor. */
export type CursorPart = string | number;

/** Thrown when a client-supplied cursor is malformed — mapped to a 400 upstream. */
export class InvalidCursorError extends Error {
  constructor(cursor: string) {
    super(`Invalid pagination cursor: ${JSON.stringify(cursor)}`);
    this.name = 'InvalidCursorError';
  }
}

/** Clamp a requested limit into `[1, MAX_PAGE_LIMIT]`, defaulting when absent/invalid. */
export function clampLimit(limit?: number): number {
  if (limit === undefined || !Number.isFinite(limit)) {
    return DEFAULT_PAGE_LIMIT;
  }
  const floored = Math.floor(limit);
  if (floored < 1) {
    return 1;
  }
  return Math.min(floored, MAX_PAGE_LIMIT);
}

function isCursorPart(value: unknown): value is CursorPart {
  return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));
}

/** Encode an ordering-key tuple into an opaque, URL-safe cursor string. */
export function encodeCursor(parts: readonly CursorPart[]): string {
  return Buffer.from(JSON.stringify(parts), 'utf8').toString('base64url');
}

/** Decode a cursor back into its key tuple, throwing on any malformation. */
export function decodeCursor(cursor: string): CursorPart[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new InvalidCursorError(cursor);
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every(isCursorPart)) {
    throw new InvalidCursorError(cursor);
  }
  return parsed;
}

/** Decode a cursor and assert its arity, throwing on mismatch — boundary validation. */
export function decodeCursorTuple(cursor: string, arity: number): CursorPart[] {
  const parts = decodeCursor(cursor);
  if (parts.length !== arity) {
    throw new InvalidCursorError(cursor);
  }
  return parts;
}

/**
 * Assemble a {@link Page} from over-fetched rows. Pass `limit + 1` rows: if the
 * extra row is present there is a next page, and `toCursor` of the last KEPT row
 * becomes `nextCursor`; otherwise this is the final page. `total`, when provided
 * (first page only, D9), is carried through unchanged.
 */
export function buildPage<T>(
  rows: readonly T[],
  limit: number,
  toCursor: (row: T) => string,
  total?: number,
): Page<T> {
  const withTotal = total === undefined ? {} : { total };
  if (rows.length <= limit) {
    return { items: rows, nextCursor: null, ...withTotal };
  }
  const items = rows.slice(0, limit);
  const last = items[items.length - 1] as T;
  return { items, nextCursor: toCursor(last), ...withTotal };
}

/**
 * Resolve the page `total` (D9): the count is computed ONLY on the first page (no
 * cursor), where one extra round-trip sizes the whole result; later pages omit it
 * (it cannot change mid-walk under a keyset, and a repeat count is wasted work).
 */
export async function firstPageTotal(
  cursor: string | undefined,
  count: () => Promise<number>,
): Promise<number | undefined> {
  return cursor === undefined ? count() : undefined;
}
