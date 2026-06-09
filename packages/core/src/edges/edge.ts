import { z } from 'zod';
import { EDGE_KINDS } from '../constants.js';
import { SubKindSchema } from '../subkind.js';
import { ProvenanceSchema, withResolution } from '../trust/resolution.js';

/**
 * The universal edge model (ADR-0015 §5, §8, §11). Edges are stored once in
 * their natural (forward) direction; reverse traversal is derived downstream,
 * never duplicated here (ADR-0015 §11).
 *
 * `kind` is a CLOSED enum (not a discriminator — every edge kind shares the
 * same shape). The PRIMARY discriminator is `resolution`: the trust
 * invariant (ADR-0015 §8) is that `confidence` exists if and only if the edge
 * is `inferred`. A `deterministic` edge is a strict object that rejects a
 * `confidence` field; an `inferred` edge requires one. This is shared with
 * the call-site payload via `withResolution`, so the invariant lives once.
 *
 * Every edge carries `provenance` (which pass/rule produced it).
 */
const edgeBaseShape = {
  kind: z.enum(EDGE_KINDS),
  subKind: SubKindSchema.optional(),
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  provenance: ProvenanceSchema,
};

export const EdgeSchema = withResolution(edgeBaseShape);
export type Edge = z.infer<typeof EdgeSchema>;

export type EdgeKind = (typeof EDGE_KINDS)[number];
