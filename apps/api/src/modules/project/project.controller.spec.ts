import type { MembershipRepository, Page, ProjectRecord, ProjectRepository } from '@toopo/db';
import { describe, expect, it, vi } from 'vitest';
import type { CurrentSessionData } from '../user/session.guard';
import { ProjectController } from './project.controller';
import { ProjectListQueryDto } from './project.dto';

const record: ProjectRecord = {
  id: 'p1',
  ownerUserId: 'u1',
  workspaceId: 'ws-1',
  repoHost: 'github',
  repoOwner: 'acme',
  repoName: 'web',
  installationId: '42',
  archivedAt: null,
  createdAt: new Date('2026-06-10T01:02:03.000Z'),
  updatedAt: new Date('2026-06-10T04:05:06.000Z'),
};

const session: CurrentSessionData = {
  user: { id: 'u1', email: 'a@b.c', name: 'A', emailVerified: true },
  session: { id: 's1', userId: 'u1' },
};

function fakeProjects(overrides: Partial<ProjectRepository>): ProjectRepository {
  return {
    listProjectsInWorkspaces: vi.fn(() =>
      Promise.resolve<Page<ProjectRecord>>({ items: [], nextCursor: null }),
    ),
    findProjectById: vi.fn(() => Promise.resolve(null)),
    ...overrides,
  } as unknown as ProjectRepository;
}

function fakeMemberships(workspaceIds: readonly string[]): MembershipRepository {
  return {
    listWorkspaceIds: vi.fn(() => Promise.resolve(workspaceIds)),
  } as unknown as MembershipRepository;
}

describe('ProjectController.list (membership-scoped, ADR-0028 §Phase 3)', () => {
  it('lists only the projects in the caller workspaces and maps to the wire shape', async () => {
    const listProjectsInWorkspaces = vi.fn(() =>
      Promise.resolve<Page<ProjectRecord>>({ items: [record], nextCursor: 'c1' }),
    );
    const memberships = fakeMemberships(['ws-1', 'ws-2']);
    const controller = new ProjectController(
      fakeProjects({ listProjectsInWorkspaces }),
      memberships,
    );

    const page = await controller.list(session, { limit: 10, cursor: 'c0' } as ProjectListQueryDto);

    expect(memberships.listWorkspaceIds).toHaveBeenCalledWith('u1');
    // Scoped to exactly the caller's workspaces.
    expect(listProjectsInWorkspaces).toHaveBeenCalledWith(['ws-1', 'ws-2'], {
      limit: 10,
      cursor: 'c0',
    });
    expect(page.nextCursor).toBe('c1');
    expect(page.items).toEqual([
      {
        id: 'p1',
        ownerUserId: 'u1',
        repoHost: 'github',
        repoOwner: 'acme',
        repoName: 'web',
        installationId: '42',
        createdAt: '2026-06-10T01:02:03.000Z',
        updatedAt: '2026-06-10T04:05:06.000Z',
      },
    ]);
  });

  it('returns an empty page for a caller in no workspace', async () => {
    const listProjectsInWorkspaces = vi.fn(() =>
      Promise.resolve<Page<ProjectRecord>>({ items: [], nextCursor: null }),
    );
    const controller = new ProjectController(
      fakeProjects({ listProjectsInWorkspaces }),
      fakeMemberships([]),
    );

    const page = await controller.list(session, {} as ProjectListQueryDto);

    expect(listProjectsInWorkspaces).toHaveBeenCalledWith([], {
      limit: undefined,
      cursor: undefined,
    });
    expect(page.items).toEqual([]);
  });
});

describe('ProjectController.get', () => {
  it('serializes the project the ProjectAccessGuard already authorized', () => {
    // Unknown → 404 and non-member → 403 are enforced by ProjectAccessGuard
    // (proven in its spec); the controller only maps the attached project.
    const controller = new ProjectController(fakeProjects({}), fakeMemberships(['ws-1']));
    const project = controller.get(record);
    expect(project.id).toBe('p1');
    expect(project.createdAt).toBe('2026-06-10T01:02:03.000Z');
  });
});
