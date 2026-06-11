/**
 * The typed client for the project read API (ADR-0022 §5, membership-scoped per
 * ADR-0028 Phase 3). Lists the CALLER'S connected repos — the projects in the
 * workspaces they belong to, not the whole instance; the response is validated
 * against the api-contracts schema in `requestJson` (ADR-0006). Used by the
 * project picker (a gated server component that forwards the session cookie via
 * `init`).
 */
import { type ProjectPage, ProjectPageSchema, projectsApiPath } from '@toopo/api-contracts';
import { requestJson } from '../http';

export function listMyProjects(locale?: string, init?: RequestInit): Promise<ProjectPage> {
  return requestJson(projectsApiPath(), ProjectPageSchema, locale, init);
}
