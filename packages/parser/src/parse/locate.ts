import type { Location } from '@toopo/core';
import type { Node as SyntaxNode } from 'web-tree-sitter';

/**
 * Map a tree-sitter node to a core `Location` (ADR-0015 Fork 6: volatile
 * position metadata, never identity). Core's coordinates are tree-sitter-native
 * — 0-based row/column plus byte offsets — so this is a direct field copy with
 * no conversion; any 1-based display mapping is the UI's concern.
 */
export function locate(node: SyntaxNode): Location {
  return {
    start: { row: node.startPosition.row, column: node.startPosition.column },
    end: { row: node.endPosition.row, column: node.endPosition.column },
    startByte: node.startIndex,
    endByte: node.endIndex,
  };
}
