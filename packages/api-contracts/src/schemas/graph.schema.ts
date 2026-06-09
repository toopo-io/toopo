/**
 * The Serve read API contract (ADR-0020 Fork 2): the request (query) and
 * response Zod schemas the backend validates against and the frontend parses,
 * shared as one source of truth (ADR-0006). Response shapes embed the canonical
 * `@toopo/core` Node/Edge schemas directly — the model is never re-declared
 * here (ADR-0015: core is the single source of truth). Every edge therefore
 * carries its `resolution`/`confidence`, so trust is visible to the UI
 * (ADR-0015 §8).
 *
 * All list responses use one keyset-pagination envelope (ADR-0020 Fork 4):
 * `{ items, nextCursor, total? }`. `nextCursor` is `null` on the last page.
 * Node ids (SCIP descriptor paths) contain `/`, spaces and backticks, so every
 * id-bearing endpoint takes the id as a query parameter, never a path segment.
 */
import { EDGE_KINDS, EdgeSchema, NODE_KINDS, NodeSchema } from '@toopo/core';
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

// ───────────────────────── Request (query) schemas ─────────────────────────

/**
 * V1 map: `GET /v1/graph/map`. The symbol level requires a `scope` (a file id),
 * so it can never be unbounded; package/file may omit it (ADR-0020 Fork 4).
 */
export const MapQuerySchema = z
  .object({ level: MapLevelSchema, scope: z.string().min(1).optional(), limit: limitField })
  .strict()
  .refine((query) => query.level !== 'symbol' || query.scope !== undefined, {
    message: 'scope is required when level is "symbol"',
    path: ['scope'],
  });
export type MapQuery = z.infer<typeof MapQuerySchema>;

/** V2 node detail: `GET /v1/graph/node`. */
export const NodeQuerySchema = z.object({ id: idField }).strict();
export type NodeQuery = z.infer<typeof NodeQuerySchema>;

/** V3 neighbors: `GET /v1/graph/neighbors`. */
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

/** V4 blast radius: `GET /v1/graph/blast-radius`. */
export const BlastRadiusQuerySchema = z
  .object({
    id: idField,
    maxDepth: z.coerce.number().int().positive().optional(),
    limit: limitField,
    cursor: cursorField,
  })
  .strict();
export type BlastRadiusQuery = z.infer<typeof BlastRadiusQuerySchema>;

/** Declared-interface and call-sites lists (zoom-in): `GET /v1/graph/{…}`. */
export const NodeRelationsQuerySchema = z
  .object({ id: idField, limit: limitField, cursor: cursorField })
  .strict();
export type NodeRelationsQuery = z.infer<typeof NodeRelationsQuerySchema>;

/** V5 search: `GET /v1/graph/search`. */
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

// ───────────────────────────── Pagination envelope ─────────────────────────

/** Wrap an item schema in the keyset-pagination envelope (ADR-0020 Fork 4). */
export function paginated<T extends z.ZodTypeAny>(item: T) {
  return z
    .object({
      items: z.array(item),
      nextCursor: z.string().nullable(),
      total: z.number().int().nonnegative().optional(),
    })
    .strict();
}

// ───────────────────────────── Response schemas ────────────────────────────

/** An edge and the node on its far end (null for an external id, ADR-0015 Fork 1). */
export const GraphNeighborSchema = z
  .object({ edge: EdgeSchema, node: NodeSchema.nullable() })
  .strict();
export type GraphNeighbor = z.infer<typeof GraphNeighborSchema>;

export const NodePageSchema = paginated(NodeSchema);
export type NodePage = z.infer<typeof NodePageSchema>;

export const NeighborPageSchema = paginated(GraphNeighborSchema);
export type NeighborPage = z.infer<typeof NeighborPageSchema>;

/** A blast-radius dependent, hydrated with its node and shortest depth. */
export const BlastRadiusNodeSchema = z
  .object({ nodeId: idField, depth: z.number().int().nonnegative(), node: NodeSchema.nullable() })
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
