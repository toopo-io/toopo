import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { MembershipRepository, ProjectRecord, ProjectRepository } from '@toopo/db';
import { describe, expect, it, vi } from 'vitest';
import type { CurrentSessionData } from '../user/session.guard';
import { ProjectAccessGuard, type RequestWithProject } from './project-access.guard';

const project: ProjectRecord = {
  id: 'p1',
  ownerUserId: 'u1',
  workspaceId: 'ws-1',
  repoHost: 'github',
  repoOwner: 'acme',
  repoName: 'web',
  installationId: null,
  archivedAt: null,
  createdAt: new Date('2026-06-10T00:00:00.000Z'),
  updatedAt: new Date('2026-06-10T00:00:00.000Z'),
};

const session: CurrentSessionData = {
  user: { id: 'u1', email: 'a@b.c', name: 'A', emailVerified: true },
  session: { id: 's1', userId: 'u1' },
};

function fakeProjects(findResult: ProjectRecord | null): ProjectRepository {
  return {
    findProjectById: vi.fn(() => Promise.resolve(findResult)),
  } as unknown as ProjectRepository;
}

function fakeMemberships(isMember: boolean): {
  repo: MembershipRepository;
  isMemberFn: ReturnType<typeof vi.fn>;
} {
  const isMemberFn = vi.fn(() => Promise.resolve(isMember));
  return { repo: { isMember: isMemberFn } as unknown as MembershipRepository, isMemberFn };
}

function contextFor(req: Partial<RequestWithProject>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('ProjectAccessGuard (membership-scoped, ADR-0028 §Phase 3)', () => {
  it('rejects when no session is present (must run after the SessionGuard) — 401', async () => {
    const guard = new ProjectAccessGuard(fakeProjects(project), fakeMemberships(true).repo);
    await expect(
      guard.canActivate(contextFor({ params: { projectId: 'p1' } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('404s when the projectId path param is missing', async () => {
    const guard = new ProjectAccessGuard(fakeProjects(project), fakeMemberships(true).repo);
    await expect(
      guard.canActivate(contextFor({ betterAuthSession: session, params: {} })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s when the project does not exist (membership never consulted)', async () => {
    const memberships = fakeMemberships(true);
    const guard = new ProjectAccessGuard(fakeProjects(null), memberships.repo);
    await expect(
      guard.canActivate(contextFor({ betterAuthSession: session, params: { projectId: 'nope' } })),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(memberships.isMemberFn).not.toHaveBeenCalled();
  });

  it('member → 200: attaches the project, checking membership of the PERSISTED workspace', async () => {
    const memberships = fakeMemberships(true);
    const guard = new ProjectAccessGuard(fakeProjects(project), memberships.repo);
    const req: Partial<RequestWithProject> = {
      betterAuthSession: session,
      params: { projectId: 'p1' },
    };
    await expect(guard.canActivate(contextFor(req))).resolves.toBe(true);
    expect(req.toopoProject).toBe(project);
    // Server-side workspace: checked against project.workspaceId, never the request.
    expect(memberships.isMemberFn).toHaveBeenCalledWith('u1', 'ws-1');
  });

  it('non-member → 403 and the project is NOT attached', async () => {
    const guard = new ProjectAccessGuard(fakeProjects(project), fakeMemberships(false).repo);
    const req: Partial<RequestWithProject> = {
      betterAuthSession: session,
      params: { projectId: 'p1' },
    };
    await expect(guard.canActivate(contextFor(req))).rejects.toBeInstanceOf(ForbiddenException);
    expect(req.toopoProject).toBeUndefined();
  });

  it('cross-workspace → 403: a member of another workspace cannot reach this project', async () => {
    // isMember('u1', 'ws-1') is false — the user belongs to a different workspace.
    const memberships = fakeMemberships(false);
    const guard = new ProjectAccessGuard(fakeProjects(project), memberships.repo);
    await expect(
      guard.canActivate(contextFor({ betterAuthSession: session, params: { projectId: 'p1' } })),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(memberships.isMemberFn).toHaveBeenCalledWith('u1', 'ws-1');
  });
});
