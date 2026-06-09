import { FORMAT_VERSION } from '@toopo/core';
import type { ParseResult } from '../result.js';
import { buildFileNode, type FileNodeInput } from './file-node.js';

/**
 * Graceful degradation (ADR-0015 §9, ADR-0016): an unsupported or unparseable
 * file still produces a valid graph fragment — a single file node carrying the
 * non-`analyzed` status and its reason, with no symbols or edges. A broken or
 * unsupported file degrades locally and never fails the whole analysis.
 */
export function degradedResult(input: FileNodeInput): ParseResult {
  return {
    document: {
      formatVersion: FORMAT_VERSION,
      nodes: [buildFileNode(input)],
      edges: [],
    },
    unresolved: [],
    exports: [],
    reExports: [],
  };
}
