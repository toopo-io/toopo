/**
 * Scoped Serve read primitives for the Kysely repository (ADR-0020 Phase A): the
 * keyset-paginated lists — search, declared interface, contained declarations,
 * call-sites, and the persisted unresolved-reference tail (C11). Each builds a
 * filtered, project-scoped base (ADR-0022 §3), counts it once on the first page,
 * and over-fetches `limit + 1` rows ordered by its stable keyset column.
 */
import type { Node, SymbolId, UnresolvedReference } from '@toopo/core';
import { type Kysely, type RawBuilder, type SqlBool, sql } from 'kysely';
import type { GraphDatabase } from '../schema/graph-types.js';
import { countAll } from './graph.query-helpers.js';
import type { SearchOptions, UnresolvedReferenceOptions } from './graph.repository.js';
import {
  buildPage,
  clampLimit,
  decodeCursorTuple,
  encodeCursor,
  firstPageTotal,
  type Page,
  type PageOptions,
} from './graph-page.js';
import { rowToNode, rowToUnresolvedReference, unresolvedReferenceKey } from './graph-records.js';
import type { GraphScope } from './graph-scope.js';
import { escapeLikeOperand, LIKE_ESCAPE } from './sql-like.js';

/** Portable case-insensitive name/path substring predicate (escaped LIKE). */
function nameOrPathMatches(query: string): RawBuilder<SqlBool> {
  const pattern = sql`'%' || lower(${escapeLikeOperand(sql`${query}`)}) || '%'`;
  return sql<SqlBool>`(
    lower(coalesce("name", '')) like ${pattern} escape ${LIKE_ESCAPE}
    or lower(coalesce("path", '')) like ${pattern} escape ${LIKE_ESCAPE}
  )`;
}

export async function search(
  db: Kysely<GraphDatabase>,
  scope: GraphScope,
  options?: SearchOptions,
): Promise<Page<Node>> {
  const limit = clampLimit(options?.limit);
  let base = db.selectFrom('node').where('project_id', '=', scope.projectId);
  if (options?.kind !== undefined) {
    base = base.where('kind', '=', options.kind);
  }
  if (options?.subKind !== undefined) {
    base = base.where('sub_kind', '=', options.subKind);
  }
  if (options?.query !== undefined && options.query.length > 0) {
    base = base.where(nameOrPathMatches(options.query));
  }
  const total = await firstPageTotal(options?.cursor, () => countAll(base));
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

export async function declaredInterface(
  db: Kysely<GraphDatabase>,
  scope: GraphScope,
  id: SymbolId,
  options?: PageOptions,
): Promise<Page<Node>> {
  const limit = clampLimit(options?.limit);
  // Both sides are scoped: the contains edge AND the contained node, so a
  // colliding id in another project can never join in (ADR-0022 §3).
  const base = db
    .selectFrom('edge as c')
    .innerJoin('node as n', 'n.id', 'c.target_id')
    .where('c.project_id', '=', scope.projectId)
    .where('n.project_id', '=', scope.projectId)
    .where('c.source_id', '=', id)
    .where('c.kind', '=', 'contains')
    .where('n.kind', '=', 'symbol');
  const total = await firstPageTotal(options?.cursor, () => countAll(base));
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

export async function containedDeclarations(
  db: Kysely<GraphDatabase>,
  scope: GraphScope,
  id: SymbolId,
  options?: PageOptions,
): Promise<Page<Node>> {
  const limit = clampLimit(options?.limit);
  // Both sides scoped (ADR-0022 §3). Exclude call-sites — they are statements,
  // not declarations (served by callSitesOf); every other contained kind is a
  // declaration (a package's files, a file's symbols, a symbol's members).
  const base = db
    .selectFrom('edge as c')
    .innerJoin('node as n', 'n.id', 'c.target_id')
    .where('c.project_id', '=', scope.projectId)
    .where('n.project_id', '=', scope.projectId)
    .where('c.source_id', '=', id)
    .where('c.kind', '=', 'contains')
    .where('n.kind', '!=', 'callSite');
  const total = await firstPageTotal(options?.cursor, () => countAll(base));
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

export async function callSitesOf(
  db: Kysely<GraphDatabase>,
  scope: GraphScope,
  id: SymbolId,
  options?: PageOptions,
): Promise<Page<Node>> {
  const limit = clampLimit(options?.limit);
  const base = db
    .selectFrom('node')
    .where('project_id', '=', scope.projectId)
    .where('enclosing_symbol_id', '=', id)
    .where('kind', '=', 'callSite');
  const total = await firstPageTotal(options?.cursor, () => countAll(base));
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

export async function unresolvedReferences(
  db: Kysely<GraphDatabase>,
  scope: GraphScope,
  options?: UnresolvedReferenceOptions,
): Promise<Page<UnresolvedReference>> {
  const limit = clampLimit(options?.limit);
  // An empty code-family filter matches nothing — short-circuit (and avoid an
  // empty `in ()`, which is not portable SQL). First page carries total 0.
  if (options?.codes !== undefined && options.codes.length === 0) {
    return { items: [], nextCursor: null, ...(options.cursor === undefined ? { total: 0 } : {}) };
  }
  let base = db.selectFrom('unresolved_reference').where('project_id', '=', scope.projectId);
  if (options?.targetFileId !== undefined) {
    base = base.where('target_file_id', '=', options.targetFileId);
  }
  if (options?.codes !== undefined) {
    base = base.where('code', 'in', options.codes);
  }
  const total = await firstPageTotal(options?.cursor, () => countAll(base));
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
