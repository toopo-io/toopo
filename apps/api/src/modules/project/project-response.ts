/**
 * Map a repository {@link ProjectRecord} (with `Date` timestamps) to the wire
 * {@link ProjectResponse} (ISO strings). The administrative project entity is
 * serialized here; the graph model (`@toopo/core`) is untouched (ADR-0022 §1).
 */
import type { ProjectResponse } from '@toopo/api-contracts';
import type { ProjectRecord } from '@toopo/db';

export function toProjectResponse(project: ProjectRecord): ProjectResponse {
  return {
    id: project.id,
    ownerUserId: project.ownerUserId,
    repoHost: project.repoHost,
    repoOwner: project.repoOwner,
    repoName: project.repoName,
    installationId: project.installationId,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}
