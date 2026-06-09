import { z } from 'zod';
import { FORMAT_VERSION } from '../constants.js';
import { EdgeSchema } from '../edges/edge.js';
import { sortEdges, sortNodes } from '../identity/compare.js';
import { NodeSchema } from '../nodes/node.js';

/**
 * The serialization unit of the graph (ADR-0015 Fork 3). It carries a single
 * `formatVersion` for forward-compatible migration, plus whatever set of
 * nodes and edges is being produced or applied.
 *
 * This is intentionally a FRAGMENT, not only a whole-repo dump: it is exactly
 * what a parser emits for one changed file in ADR-0016's file-level
 * incremental flow. Empty `nodes`/`edges` are valid (e.g. an analyzed file
 * that declares nothing).
 */
export const GraphDocumentSchema = z
  .object({
    formatVersion: z.literal(FORMAT_VERSION),
    nodes: z.array(NodeSchema),
    edges: z.array(EdgeSchema),
  })
  .strict();
export type GraphDocument = z.infer<typeof GraphDocumentSchema>;

/**
 * Return a new document with nodes and edges in canonical order (ADR-0016
 * determinism). The input is never mutated.
 */
export function canonicalizeGraphDocument(document: GraphDocument): GraphDocument {
  return {
    formatVersion: document.formatVersion,
    nodes: sortNodes(document.nodes),
    edges: sortEdges(document.edges),
  };
}
