/**
 * Canonical Serve read-API route segments (ADR-0020 Fork 2, ADR-0014 spirit):
 * one source of truth for the graph endpoint paths, shared by the backend
 * controller (which uses them in its Nest route decorators) and by clients and
 * e2e tests (which build `/v1/<base>/<segment>`). Centralizing here prevents
 * drift between the routes the backend serves and the URLs clients call.
 *
 * Every id-bearing endpoint takes the node id as a query parameter (`?id=…`),
 * never a path segment, because SCIP ids contain `/`, spaces and backticks.
 */

/** The versioned API prefix the Nest app mounts under (`enableVersioning`). */
export const GRAPH_API_VERSION = '1';

/** The graph controller's base path (under the version prefix). */
export const GRAPH_CONTROLLER_PATH = 'graph';

/** Graph endpoint segments, relative to {@link GRAPH_CONTROLLER_PATH}. */
export const GRAPH_SEGMENTS = {
  /** V1 — the aggregate map at a containment level. */
  MAP: 'map',
  /** V2 — composed node detail (node + interface + neighbours + call-sites). */
  NODE: 'node',
  /** V3 — paginated neighbours (callers/callees). */
  NEIGHBORS: 'neighbors',
  /** V4 — bounded blast radius. */
  BLAST_RADIUS: 'blast-radius',
  /** Declared interface (zoom-in): a symbol's contained param/prop symbols. */
  DECLARED_INTERFACE: 'declared-interface',
  /** Call-sites (zoom-in): the call-sites a symbol encloses. */
  CALL_SITES: 'call-sites',
  /** V5 — node search by name/path/kind/subKind. */
  SEARCH: 'search',
} as const;

export type GraphSegment = (typeof GRAPH_SEGMENTS)[keyof typeof GRAPH_SEGMENTS];

/** The full client path for a graph segment, e.g. `/v1/graph/map`. */
export function graphApiPath(segment: GraphSegment): string {
  return `/v${GRAPH_API_VERSION}/${GRAPH_CONTROLLER_PATH}/${segment}`;
}
