import type { Node as SyntaxNode } from 'web-tree-sitter';

/**
 * The module specifier text of an `import`/`export … from` statement (its
 * `source` field), without the surrounding quotes; `null` when the statement
 * has no source (a local export, or a malformed node). Shared by the import and
 * export passes so the two never drift on how a specifier is read.
 */
export function moduleSpecifier(statement: SyntaxNode): string | null {
  const source = statement.childForFieldName('source');
  if (source === null) {
    return null;
  }
  const fragment = source.namedChildren.find((child) => child.type === 'string_fragment');
  return fragment?.text ?? null;
}
