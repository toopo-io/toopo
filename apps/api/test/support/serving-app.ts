/**
 * Shared e2e scaffolding for the project-scoped Serve API (ADR-0022). A booted
 * "serving" app bypasses the two real guards and injects a fixed project, so the
 * graph endpoints can be exercised against a seeded, project-scoped graph without
 * standing up a real session. The gating itself (401) is proven separately with
 * the real guards.
 */
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { ProjectRecord } from '@toopo/db';
import type { RequestWithProject } from '../../src/modules/project/project-access.guard';
import type { RequestWithSession } from '../../src/modules/user/session.guard';

/** The project id the serving e2e seeds and serves under. */
export const E2E_PROJECT_ID = 'e2e-project';

/** The resolved project the injector attaches (stands in for ProjectAccessGuard). */
export const e2eProject: ProjectRecord = {
  id: E2E_PROJECT_ID,
  ownerUserId: 'u1',
  workspaceId: 'ws-1',
  repoHost: 'github',
  repoOwner: 'acme',
  repoName: 'web',
  installationId: null,
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

/** Bypasses the SessionGuard for the serving e2e (auth is proven separately). */
export const allowSession: CanActivate = { canActivate: () => true };

/**
 * Stands in for the SessionGuard but ATTACHES a real session for `userId`, so the
 * downstream REAL ProjectAccessGuard can run its membership check end-to-end (the
 * authz-wiring e2e). Distinct from {@link allowSession}, which sets no session.
 * `activeOrganizationId` mirrors the Better Auth session pointer the listing scopes
 * to (ADR-0028 §4); defaults to null (no active workspace).
 */
export function sessionAs(userId: string, activeOrganizationId: string | null = null): CanActivate {
  return {
    canActivate(context: ExecutionContext): boolean {
      context.switchToHttp().getRequest<RequestWithSession>().betterAuthSession = {
        user: { id: userId, email: `${userId}@e2e.test`, name: userId, emailVerified: true },
        session: { id: `sess-${userId}`, userId, activeOrganizationId },
      };
      return true;
    },
  };
}

/** Stands in for the ProjectAccessGuard: attaches {@link e2eProject} to the request. */
export const projectInjector: CanActivate = {
  canActivate(context: ExecutionContext): boolean {
    context.switchToHttp().getRequest<RequestWithProject>().toopoProject = e2eProject;
    return true;
  },
};
