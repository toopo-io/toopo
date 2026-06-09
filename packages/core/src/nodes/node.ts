import { z } from 'zod';
import { JsonObjectSchema } from '../properties/json.js';
import { SubKindSchema } from '../subkind.js';
import { AnalysisSchema } from './analysis-status.js';
import { LocationSchema } from './location.js';
import { CallSitePayloadArgumentSchema } from './payload.js';

/**
 * The universal node model (ADR-0015 §2, §5). Five CLOSED structural kinds in
 * the containment hierarchy Repo > Package > File > Symbol > CallSite, each
 * discriminated by `kind`, each carrying:
 *   - `id`           — the stable SymbolId (descriptor path; never line/col).
 *   - `subKind?`     — open, language-namespaced refinement (Fork 4).
 *   - `properties`   — open, JSON-safe bag (defaults to `{}`).
 *   - `location?`    — volatile source position (never identity, Fork 6).
 *   - `analysis?`    — per-entry status (required on File; ADR-0015 §9).
 *
 * A symbol's declared parameters/props are NOT embedded here: they are CHILD
 * `symbol` nodes linked by `contains` edges (ADR-0015 §6), which keeps the
 * closed kind set intact and makes the declared interface independently
 * queryable.
 */
const baseNodeShape = {
  id: z.string().min(1),
  subKind: SubKindSchema.optional(),
  properties: JsonObjectSchema.default({}),
  location: LocationSchema.optional(),
};

export const RepoNodeSchema = z
  .object({
    kind: z.literal('repo'),
    ...baseNodeShape,
    name: z.string().min(1),
    analysis: AnalysisSchema.optional(),
  })
  .strict();
export type RepoNode = z.infer<typeof RepoNodeSchema>;

export const PackageNodeSchema = z
  .object({
    kind: z.literal('package'),
    ...baseNodeShape,
    name: z.string().min(1),
    version: z.string().min(1).optional(),
    analysis: AnalysisSchema.optional(),
  })
  .strict();
export type PackageNode = z.infer<typeof PackageNodeSchema>;

export const FileNodeSchema = z
  .object({
    kind: z.literal('file'),
    ...baseNodeShape,
    path: z.string().min(1),
    // Opaque content hash (ADR-0015 §10). The ALGORITHM is the parser's, not
    // core's — core only mandates an opaque non-empty string.
    contentHash: z.string().min(1),
    analysis: AnalysisSchema,
  })
  .strict();
export type FileNode = z.infer<typeof FileNodeSchema>;

export const SymbolNodeSchema = z
  .object({
    kind: z.literal('symbol'),
    ...baseNodeShape,
    name: z.string().min(1),
    analysis: AnalysisSchema.optional(),
  })
  .strict();
export type SymbolNode = z.infer<typeof SymbolNodeSchema>;

export const CallSiteNodeSchema = z
  .object({
    kind: z.literal('callSite'),
    ...baseNodeShape,
    enclosingSymbolId: z.string().min(1),
    callee: z.string().min(1),
    ordinal: z.number().int().nonnegative(),
    payload: z.array(CallSitePayloadArgumentSchema).default([]),
    analysis: AnalysisSchema.optional(),
  })
  .strict();
export type CallSiteNode = z.infer<typeof CallSiteNodeSchema>;

export const NodeSchema = z.discriminatedUnion('kind', [
  RepoNodeSchema,
  PackageNodeSchema,
  FileNodeSchema,
  SymbolNodeSchema,
  CallSiteNodeSchema,
]);
export type Node = z.infer<typeof NodeSchema>;
