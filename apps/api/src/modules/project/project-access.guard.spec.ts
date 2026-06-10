import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { ProjectRecord, ProjectRepository } from '@toopo/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentSessionData } from '../user/session.guard';
import { canAccessProject } from './project-access';
import { ProjectAccessGuard, type RequestWithProject } from './project-access.guard';

vi.mock('./project-access', () => ({ canAccessProject: vi.fn(() => true) }));
const mockCanAccess = vi.mocked(canAccessProject);

const project: ProjectRecord = {
  id: 'p1',
  ownerUserId: 'u1',
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

function contextFor(req: Partial<RequestWithProject>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('ProjectAccessGuard', () => {
  beforeEach(() => {
    mockCanAccess.mockReturnValue(true);
  });

  it('rejects when no session is present (must run after the SessionGuard)', async () => {
    const guard = new ProjectAccessGuard(fakeProjects(project));
    await expect(
      guard.canActivate(contextFor({ params: { projectId: 'p1' } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('404s when the projectId path param is missing', async () => {
    const guard = new ProjectAccessGuard(fakeProjects(project));
    await expect(
      guard.canActivate(contextFor({ betterAuthSession: session, params: {} })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s when the project does not exist', async () => {
    const guard = new ProjectAccessGuard(fakeProjects(null));
    await expect(
      guard.canActivate(contextFor({ betterAuthSession: session, params: { projectId: 'nope' } })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('attaches the resolved project and allows the request', async () => {
    const guard = new ProjectAccessGuard(fakeProjects(project));
    const req: Partial<RequestWithProject> = {
      betterAuthSession: session,
      params: { projectId: 'p1' },
    };
    await expect(guard.canActivate(contextFor(req))).resolves.toBe(true);
    expect(req.toopoProject).toBe(project);
  });

  it('forbids when the access predicate denies (the cloud-isolation hook)', async () => {
    mockCanAccess.mockReturnValue(false);
    const guard = new ProjectAccessGuard(fakeProjects(project));
    await expect(
      guard.canActivate(contextFor({ betterAuthSession: session, params: { projectId: 'p1' } })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
