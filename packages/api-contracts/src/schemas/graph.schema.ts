/**
 * The Serve read API contract (ADR-0020 §2): the request (query) and
 * response Zod schemas the backend validates against and the frontend parses,
 * shared as one source of truth (ADR-0006). Response shapes embed the canonical
 * `@toopo/core` Node/Edge schemas directly — the model is never re-declared
 * here (ADR-0015: core is the single source of truth). Every edge therefore
 * carries its `resolution`/`confidence`, so trust is visible to the UI
 * (ADR-0015 §8).
 *
 * All list responses use one keyset-pagination envelope (ADR-0020 §4):
 * `{ items, nextCursor, total? }`. `nextCursor` is `null` on the last page.
 * Node ids (SCIP descriptor paths) contain `/`, spaces and backticks, so every
 * id-bearing endpoint takes the id as a query parameter, never a path segment.
 */
import {
  CallSitePayloadArgumentSchema,
  EDGE_KINDS,
  EdgeSchema,
  NODE_KINDS,
  NodeSchema,
  RESOLUTIONS,
} from '@toopo/core';
import { z } from 'zod';

/** The containment level a map view aggregates to (ADR-0015 §2). */
export const MapLevelSchema = z.enum(['package', 'file', 'symbol']);
export type MapLevel = z.infer<typeof MapLevelSchema>;

/** Direction to follow edges from a node: reverse (`in`) or forward (`out`). */
export const NeighborDirectionSchema = z.enum(['in', 'out']);
export type NeighborDirection = z.infer<typeof NeighborDirectionSchema>;

const NodeKindSchema = z.enum(NODE_KINDS);
const EdgeKindSchema = z.enum(EDGE_KINDS);

// Query params arrive as strings; coerce the numeric ones and keep them optional.
const limitField = z.coerce.number().int().positive().optional();
const cursorField = z.string().min(1).optional();
const idField = z.string().min(1);

/**
 * V1 map: `GET /v1/projects/:projectId/graph/map`. The symbol level requires a
 * `scope` (a file id), so it can never be unbounded; package/file may omit it
 * (ADR-0020 §4).
 */
export const MapQuerySchema = z
  .object({ level: MapLevelSchema, scope: z.string().min(1).optional(), limit: limitField })
  .strict()
  .refine((query) => query.level !== 'symbol' || query.scope !== undefined, {
    message: 'scope is required when level is "symbol"',
    path: ['scope'],
  });
export type MapQuery = z.infer<typeof MapQuerySchema>;

/** V2 node detail: `GET /v1/projects/:projectId/graph/node`. */
export const NodeQuerySchema = z.object({ id: idField }).strict();
export type NodeQuery = z.infer<typeof NodeQuerySchema>;

/** V3 neighbors: `GET /v1/projects/:projectId/graph/neighbors`. */
export const NeighborsQuerySchema = z
  .object({
    id: idField,
    direction: NeighborDirectionSchema,
    kind: EdgeKindSchema.optional(),
    limit: limitField,
    cursor: cursorField,
  })
  .strict();
export type NeighborsQuery = z.infer<typeof NeighborsQuerySchema>;

/** V4 blast radius: `GET /v1/projects/:projectId/graph/blast-radius`. */
export const BlastRadiusQuerySchema = z
  .object({
    id: idField,
    maxDepth: z.coerce.number().int().positive().optional(),
    limit: limitField,
    cursor: cursorField,
  })
  .strict();
export type BlastRadiusQuery = z.infer<typeof BlastRadiusQuerySchema>;

/**
 * The shared query for the three zoom-in lists: declared-interface, container
 * declarations (D2), and call-sites — `GET /v1/projects/:projectId/graph/{…}`.
 */
export const NodeRelationsQuerySchema = z
  .object({ id: idField, limit: limitField, cursor: cursorField })
  .strict();
export type NodeRelationsQuery = z.infer<typeof NodeRelationsQuerySchema>;

/** V5 search: `GET /v1/projects/:projectId/graph/search`. */
export const SearchQuerySchema = z
  .object({
    query: z.string().min(1).optional(),
    kind: NodeKindSchema.optional(),
    subKind: z.string().min(1).optional(),
    limit: limitField,
    cursor: cursorField,
  })
  .strict();
export type SearchQuery = z.infer<typeof SearchQuerySchema>;

/**
 * A project-global list (no node id, no scope): just the keyset page controls.
 * All three Insights views (D5 name collisions, D6 unused symbols, D7 recursive
 * cycles — ADR-0029) range over the whole project, so they take only
 * `limit`/`cursor`.
 */
export const GlobalListQuerySchema = z.object({ limit: limitField, cursor: cursorField }).strict();
export type GlobalListQuery = z.infer<typeof GlobalListQuerySchema>;

/** Wrap an item schema in the keyset-pagination envelope (ADR-0020 §4). */
export function paginated<T extends z.ZodTypeAny>(item: T) {
  return z
    .object({
      items: z.array(item),
      nextCursor: z.string().nullable(),
      total: z.number().int().nonnegative().optional(),
    })
    .strict();
}

/** An edge and the node on its far end — `null` when the far id is external (outside the analysed repo). */
export const GraphNeighborSchema = z
  .object({ edge: EdgeSchema, node: NodeSchema.nullable() })
  .strict();
export type GraphNeighbor = z.infer<typeof GraphNeighborSchema>;

export const NodePageSchema = paginated(NodeSchema);
export type NodePage = z.infer<typeof NodePageSchema>;

/**
 * D6 (ADR-0029) — a top-level symbol with no incoming usage, classified by the
 * honest rule. `candidate` is true when an unresolved usage could still reach it
 * (possibly-used, never asserted unused); `exported` is the graph fact that it is
 * exported from its file — a displayed fact, never a "dead"/"API" verdict.
 */
export const UnusedSymbolSchema = z
  .object({ node: NodeSchema, candidate: z.boolean(), exported: z.boolean() })
  .strict();
export type UnusedSymbol = z.infer<typeof UnusedSymbolSchema>;

export const UnusedSymbolPageSchema = paginated(UnusedSymbolSchema);
export type UnusedSymbolPage = z.infer<typeof UnusedSymbolPageSchema>;

/**
 * D7 (ADR-0029) — a recursive cycle (an SCC) of the dependency graph. `id` is the
 * smallest member id (deterministic); `members` are the member ids (sorted,
 * capped — `truncated` flags the cap); `candidate` is true iff any edge internal
 * to the SCC is inferred (the cycle rests on a guess — never asserted certain).
 */
export const CycleSchema = z
  .object({
    id: z.string().min(1),
    members: z.array(z.string().min(1)),
    length: z.number().int().positive(),
    candidate: z.boolean(),
    truncated: z.boolean(),
  })
  .strict();
export type Cycle = z.infer<typeof CycleSchema>;

export const CyclePageSchema = paginated(CycleSchema);
export type CyclePage = z.infer<typeof CyclePageSchema>;

export const NeighborPageSchema = paginated(GraphNeighborSchema);
export type NeighborPage = z.infer<typeof NeighborPageSchema>;

/**
 * A blast-radius dependent, hydrated with its node and shortest depth, plus the
 * trust of the reverse-dependency PATH that reaches it (ADR-0021): `deterministic`
 * iff a fully-deterministic chain proves the impact, `inferred` iff every path
 * traverses ≥1 inferred edge. This makes certainly-impacted and possibly-impacted
 * dependents distinguishable per node, in the data and the UI (ADR-0015 §8) —
 * superseding the prior panel-level caveat. `depth` (proximity) and
 * `pathResolution` (trust) are independent: a node's shortest path may be inferred
 * while a longer, fully-deterministic path exists.
 */
export const BlastRadiusNodeSchema = z
  .object({
    nodeId: idField,
    depth: z.number().int().nonnegative(),
    pathResolution: z.enum(RESOLUTIONS),
    node: NodeSchema.nullable(),
  })
  .strict();
export type BlastRadiusNode = z.infer<typeof BlastRadiusNodeSchema>;

export const BlastRadiusPageSchema = z
  .object({
    items: z.array(BlastRadiusNodeSchema),
    nextCursor: z.string().nullable(),
    // True when the depth cap was reached — deeper dependents may exist (honest,
    // never silent: the UI shows "impact up to depth N").
    truncated: z.boolean(),
  })
  .strict();
export type BlastRadiusPage = z.infer<typeof BlastRadiusPageSchema>;

/** A map container node with the count of symbols it holds (for UI sizing). */
export const MapNodeSchema = z
  .object({ node: NodeSchema, childCount: z.number().int().nonnegative() })
  .strict();
export type MapNode = z.infer<typeof MapNodeSchema>;

/** A dependency edge projected between two containers, split by trust (ADR-0015 §8). */
export const MapEdgeSchema = z
  .object({
    sourceId: idField,
    targetId: idField,
    deterministic: z.number().int().nonnegative(),
    inferred: z.number().int().nonnegative(),
  })
  .strict();
export type MapEdge = z.infer<typeof MapEdgeSchema>;

export const MapViewSchema = z
  .object({
    level: MapLevelSchema,
    nodes: z.array(MapNodeSchema),
    edges: z.array(MapEdgeSchema),
    truncated: z.boolean(),
  })
  .strict();
export type MapView = z.infer<typeof MapViewSchema>;

/**
 * The composed node-detail view (V2): the node plus its declared interface,
 * incoming/outgoing neighbours (each edge carries kind + trust, so the UI reads
 * "who calls/uses this"), and enclosed call-sites — first page of each, with the
 * dedicated list endpoints serving the rest.
 */
export const NodeDetailSchema = z
  .object({
    node: NodeSchema,
    declaredInterface: NodePageSchema,
    incoming: NeighborPageSchema,
    outgoing: NeighborPageSchema,
    callSites: NodePageSchema,
  })
  .strict();
export type NodeDetail = z.infer<typeof NodeDetailSchema>;

/**
 * One payload argument of a call, stitched to the parameter/prop it binds (D1):
 * `parameter` is the receiving declared symbol and `edge` the binding `references`
 * edge (carrying `resolution`/`confidence`, so trust is visible) — both `null`
 * for an argument that bound to nothing (a spread, a positional/dynamic value, or
 * a named arg the receiver does not declare). Nothing is invented: an unbound
 * argument is shown as unbound, never guessed (the trust principle).
 */
export const CallBindingSchema = z
  .object({
    argument: CallSitePayloadArgumentSchema,
    parameter: NodeSchema.nullable(),
    edge: EdgeSchema.nullable(),
  })
  .strict();
export type CallBinding = z.infer<typeof CallBindingSchema>;

/**
 * The binding-stitched view of one call-site (D1): the call-site node (its callee,
 * ordinal, and payload) plus one {@link CallBinding} per payload argument, in
 * payload order — the cross-file "this call passes these args into those
 * parameters/props". Returns `null` upstream when the id is not a call-site.
 */
export const CallBindingsSchema = z
  .object({ callSite: NodeSchema, bindings: z.array(CallBindingSchema) })
  .strict();
export type CallBindings = z.infer<typeof CallBindingsSchema>;
