import type { Analysis, FileNode, SymbolId } from '@toopo/core';

/** The inputs to build a file node — shared by analyzed and degraded results. */
export interface FileNodeInput {
  readonly fileId: SymbolId;
  readonly path: string;
  readonly contentHash: string;
  readonly analysis: Analysis;
}

/**
 * Build the file node (ADR-0015 §2). Every parse outcome — analyzed, skipped,
 * unsupported, or broken — produces exactly one file node carrying its
 * `contentHash` (always, so the incremental cache works even for a failed
 * parse) and its `analysis` status.
 */
export function buildFileNode(input: FileNodeInput): FileNode {
  return {
    kind: 'file',
    id: input.fileId,
    path: input.path,
    contentHash: input.contentHash,
    analysis: input.analysis,
    properties: {},
  };
}
