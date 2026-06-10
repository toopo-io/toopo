/**
 * Canonical Serve read-API route segments (ADR-0020 Fork 2, ADR-0014 spirit):
 * one source of truth for the graph endpoint paths, shared by the backend
 * controller (which uses them in its Nest route decorators) and by clients and
 * e2e tests (which build the URL). Centralizing here prevents drift between the
 * routes the backend serves and the URLs clients call.
 *
 * The graph is scoped by project (ADR-0022 §3, §5): every endpoint lives under
 * `/v1/projects/:projectId/graph/*`, so the project is structurally present on
 * every request and the access guard resolves it from the path. The node id
 * stays a query parameter (`?id=…`), never a path segment, because SCIP ids
 * contain `/`, spaces and backticks.
 */

/** The versioned API prefix the Nest app mounts under (`enableVersioning`). */
export const GRAPH_API_VERSION = '1';

/** The `projects` collection segment (under the version prefix). */
export const PROJECTS_SEGMENT = 'projects';

/** The project id path-parameter name (ADR-0022 §5). */
export const GRAPH_PROJECT_ID_PARAM = 'projectId';

/** The graph controller's base path, relative to `projects/:projectId`. */
export const GRAPH_CONTROLLER_PATH = 'graph';

/**
 * The Nest controller route (under the version prefix): the project-scoped graph
 * base, e.g. `projects/:projectId/graph`. The controller mounts here so the guard
 * receives `:projectId` and every segment below is automatically scoped.
 */
export const GRAPH_CONTROLLER_ROUTE = `${PROJECTS_SEGMENT}/:${GRAPH_PROJECT_ID_PARAM}/${GRAPH_CONTROLLER_PATH}`;

/** Graph endpoint segments, relative to {@link GRAPH_CONTROLLER_ROUTE}. */
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
  /** D1 — a call-site's payload arguments stitched to the params/props they bind. */
  CALL_BINDINGS: 'call-bindings',
  /** V5 — node search by name/path/kind/subKind. */
  SEARCH: 'search',
} as const;

export type GraphSegment = (typeof GRAPH_SEGMENTS)[keyof typeof GRAPH_SEGMENTS];

/**
 * The full client path for a project-scoped graph segment, e.g.
 * `/v1/projects/p123/graph/map`. The project id is URL-encoded (it is an opaque
 * id, but encoding keeps the builder robust if the id shape ever changes).
 */
export function graphApiPath(projectId: string, segment: GraphSegment): string {
  return `/v${GRAPH_API_VERSION}/${PROJECTS_SEGMENT}/${encodeURIComponent(projectId)}/${GRAPH_CONTROLLER_PATH}/${segment}`;
}
