import { isFileNode, type Node, type SymbolId } from '@toopo/core';
import type { ModuleIndex } from '../plugin/resolver-plugin.js';
import { normalizeRepoPath } from './paths.js';

/**
 * Build the project's module index (ADR-0016): a normalized repo-relative path →
 * file id lookup over the PARSED file universe. The resolver never touches disk,
 * so "does this file exist?" is "is it in the parsed set?". Lookups normalize
 * both sides, so a candidate path resolves regardless of separator or `./`.
 */
export function buildModuleIndex(nodes: readonly Node[]): ModuleIndex {
  const fileIdByPath = new Map<string, SymbolId>();
  for (const node of nodes) {
    if (isFileNode(node)) {
      fileIdByPath.set(normalizeRepoPath(node.path), node.id);
    }
  }
  return {
    fileId: (path) => fileIdByPath.get(normalizeRepoPath(path)),
  };
}
