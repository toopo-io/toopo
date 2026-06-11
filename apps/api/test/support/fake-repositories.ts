/**
 * Shared in-memory repository fakes for the project/graph access e2e specs
 * (ADR-0022, ADR-0028). Both the authz-wiring spec and the workspace-move spec
 * boot the app with the REAL guards and override only these repositories, so the
 * fakes live here as one source rather than being re-declared per spec.
 *
 * Each fake resolves the single seeded {@link e2eProject}; membership is expressed
 * through explicit workspace-id sets (the workspaces the caller is a member/owner
 * of), which the real `ProjectAccessGuard` and the move handler read.
 */
import type { MembershipRepository, ProjectRepository } from '@toopo/db';
import { E2E_PROJECT_ID, e2eProject } from './serving-app';

/**
 * A project repository fake resolving the seeded project, listing it for its own
 * workspace, and recording a move. The move returns the project re-homed to the
 * target with a fresh `updatedAt` (the repository owns the timestamp).
 */
export function fakeProjectRepository(): ProjectRepository {
  return {
    findProjectById: (id: string) => Promise.resolve(id === E2E_PROJECT_ID ? e2eProject : null),
    listProjectsInWorkspaces: (workspaceIds: readonly string[]) =>
      Promise.resolve({
        items: workspaceIds.includes(e2eProject.workspaceId) ? [e2eProject] : [],
        nextCursor: null,
      }),
    assignProjectToWorkspace: (id: string, workspaceId: string) =>
      Promise.resolve({ ...e2eProject, id, workspaceId, updatedAt: new Date() }),
  } as unknown as ProjectRepository;
}

/**
 * A membership repository fake over explicit sets: the caller is a member of
 * `memberOf` and an owner of `ownerOf` (a subset of `memberOf`). `listWorkspaceIds`
 * returns `memberOf`, so the project listing is scoped exactly to those.
 */
export function fakeMembershipRepository(options: {
  readonly memberOf: readonly string[];
  readonly ownerOf?: readonly string[];
}): MembershipRepository {
  const ownerOf = options.ownerOf ?? [];
  return {
    isMember: (_userId: string, workspaceId: string) =>
      Promise.resolve(options.memberOf.includes(workspaceId)),
    isWorkspaceOwner: (_userId: string, workspaceId: string) =>
      Promise.resolve(ownerOf.includes(workspaceId)),
    listWorkspaceIds: () => Promise.resolve([...options.memberOf]),
  } as unknown as MembershipRepository;
}
