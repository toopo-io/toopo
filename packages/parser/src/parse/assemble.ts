import {
  canonicalizeGraphDocument,
  FORMAT_VERSION,
  type GraphDocument,
  GraphDocumentSchema,
  type SymbolId,
} from '@toopo/core';
import type { GraphFragment } from '../plugin/language-plugin.js';
import {
  LocalExportSchema,
  type ParseResult,
  ReExportSchema,
  UnresolvedImportSchema,
} from '../result.js';
import { buildFileNode } from './file-node.js';

/** Inputs to assemble an analyzed file's result from a plugin's fragment. */
export interface AssembleInput {
  readonly fileId: SymbolId;
  readonly path: string;
  readonly contentHash: string;
  readonly fragment: GraphFragment;
}

/**
 * Assemble the final `ParseResult` for an analyzed file: prepend the file node
 * to the plugin's fragment, validate at the boundary, and canonicalize.
 *
 * Boundary validation (ADR-0016 Fork 1): the plugin's output is validated
 * against the core schemas via `GraphDocumentSchema`. This checks node/edge
 * SHAPES only — it performs NO referential-integrity check, so an edge that
 * legitimately targets an external symbol (which has no in-fragment node by
 * design) is never rejected as dangling. The `unresolved` entries are likewise
 * validated against their schema before they travel to the Resolve pass.
 *
 * Canonicalization (ADR-0016 determinism): nodes and edges are ordered by the
 * shared comparator so the same file always yields a byte-identical document.
 */
export function assembleAnalyzed(input: AssembleInput): ParseResult {
  const fileNode = buildFileNode({
    fileId: input.fileId,
    path: input.path,
    contentHash: input.contentHash,
    analysis: { status: 'analyzed' },
  });

  const candidate: GraphDocument = {
    formatVersion: FORMAT_VERSION,
    nodes: [fileNode, ...input.fragment.nodes],
    edges: [...input.fragment.edges],
  };

  const document = canonicalizeGraphDocument(GraphDocumentSchema.parse(candidate));
  const unresolved = input.fragment.unresolved.map((entry) => UnresolvedImportSchema.parse(entry));
  const exports = input.fragment.exports.map((entry) => LocalExportSchema.parse(entry));
  const reExports = input.fragment.reExports.map((entry) => ReExportSchema.parse(entry));

  return { document, unresolved, exports, reExports };
}
