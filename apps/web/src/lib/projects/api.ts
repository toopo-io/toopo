/**
 * The typed client for the project read API (ADR-0022 §5). Lists the instance's
 * connected repos; the response is validated against the api-contracts schema in
 * `requestJson` (ADR-0006). Used by the project picker (a gated server component
 * that forwards the session cookie via `init`).
 */
import { type ProjectPage, ProjectPageSchema, projectsApiPath } from '@toopo/api-contracts';
import { requestJson } from '../http';

export function listProjects(locale?: string, init?: RequestInit): Promise<ProjectPage> {
  return requestJson(projectsApiPath(), ProjectPageSchema, locale, init);
}
