/**
 * Canonical project read-API route paths (ADR-0014 spirit, ADR-0022 §5): one
 * source of truth shared by the backend controller and clients. Projects are an
 * instance-tenant collection; the access guard scopes per-user/org above this in
 * a future hosted ADR.
 */
import { GRAPH_API_VERSION, PROJECTS_SEGMENT } from './graph-routes.js';

/** The projects controller base path (under the version prefix). */
export const PROJECTS_CONTROLLER_PATH = PROJECTS_SEGMENT;

/**
 * The workspace sub-resource of a project (ADR-0028, Phase 5): the route that
 * re-homes a project to another workspace, relative to `projects/:projectId`.
 */
export const PROJECT_WORKSPACE_SEGMENT = 'workspace';

/** The full client path for the projects list, e.g. `/v1/projects`. */
export function projectsApiPath(): string {
  return `/v${GRAPH_API_VERSION}/${PROJECTS_SEGMENT}`;
}

/** The full client path for one project, e.g. `/v1/projects/p123`. */
export function projectApiPath(projectId: string): string {
  return `${projectsApiPath()}/${encodeURIComponent(projectId)}`;
}

/** The full client path for a project's workspace, e.g. `/v1/projects/p123/workspace`. */
export function projectWorkspaceApiPath(projectId: string): string {
  return `${projectApiPath(projectId)}/${PROJECT_WORKSPACE_SEGMENT}`;
}
