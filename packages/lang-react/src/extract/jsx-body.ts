import type { ExtractContext } from '@toopo/parser';
import type { Node as SyntaxNode } from 'web-tree-sitter';
import { JSX_QUERY } from './queries.js';

const JSX_BODY_TYPES: ReadonlySet<string> = new Set(['jsx_element', 'jsx_self_closing_element']);

/**
 * Whether a function body returns JSX (documented heuristic, shared by the
 * top-level and local classifiers): an arrow body that IS a JSX node counts
 * directly; otherwise any JSX descendant counts. Combined with the Capitalized-
 * name gate it sets a subKind only — never an edge — so a false positive is
 * recoverable (trust principle).
 */
export function bodyReturnsJsx(ctx: ExtractContext, body: SyntaxNode | null): boolean {
  if (body === null) {
    return false;
  }
  if (JSX_BODY_TYPES.has(body.type)) {
    return true;
  }
  return ctx.query(JSX_QUERY).captures(body).length > 0;
}
