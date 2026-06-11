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

function sessionWithActive(activeOrganizationId: string | null): CurrentSessionData {
  return {
    user: { id: 'u1', email: 'a@b.c', name: 'A', emailVerified: true },
    session: { id: 's1', userId: 'u1', activeOrganizationId },
  };
}

function fakeProjects(overrides: Partial<ProjectRepository>): ProjectRepository {
  return {
    listProjectsInWorkspaces: vi.fn(() =>
      Promise.resolve<Page<ProjectRecord>>({ items: [], nextCursor: null }),
    ),
    findProjectById: vi.fn(() => Promise.resolve(null)),
    ...overrides,
  } as unknown as ProjectRepository;
}

function fakeMemberships(firstWorkspaceId: string | null): MembershipRepository {
  return {
    findFirstWorkspaceId: vi.fn(() => Promise.resolve(firstWorkspaceId)),
  } as unknown as MembershipRepository;
}

describe('ProjectController.list (active-workspace scoped, ADR-0028 §4)', () => {
  it('scopes to the session active workspace and maps the wire shape incl. workspaceId', async () => {
    const listProjectsInWorkspaces = vi.fn(() =>
      Promise.resolve<Page<ProjectRecord>>({ items: [record], nextCursor: 'c1' }),
    );
    const memberships = fakeMemberships(null);
    const controller = new ProjectController(
      fakeProjects({ listProjectsInWorkspaces }),
      memberships,
    );

    const page = await controller.list(sessionWithActive('ws-1'), {
      limit: 10,
      cursor: 'c0',
    } as ProjectListQueryDto);

    // Active workspace is authoritative — no membership fallback consulted.
    expect(memberships.findFirstWorkspaceId).not.toHaveBeenCalled();
    expect(listProjectsInWorkspaces).toHaveBeenCalledWith(['ws-1'], {
      limit: 10,
      cursor: 'c0',
    });
    expect(page.nextCursor).toBe('c1');
    expect(page.items).toEqual([
      {
        id: 'p1',
        ownerUserId: 'u1',
        workspaceId: 'ws-1',
        repoHost: 'github',
        repoOwner: 'acme',
        repoName: 'web',
        installationId: '42',
        createdAt: '2026-06-10T01:02:03.000Z',
        updatedAt: '2026-06-10T04:05:06.000Z',
      },
    ]);
  });

  it('falls back to the earliest membership when the session has no active workspace', async () => {
    const listProjectsInWorkspaces = vi.fn(() =>
      Promise.resolve<Page<ProjectRecord>>({ items: [], nextCursor: null }),
    );
    const memberships = fakeMemberships('ws-9');
    const controller = new ProjectController(
      fakeProjects({ listProjectsInWorkspaces }),
      memberships,
    );

    await controller.list(sessionWithActive(null), {} as ProjectListQueryDto);

    expect(memberships.findFirstWorkspaceId).toHaveBeenCalledWith('u1');
    expect(listProjectsInWorkspaces).toHaveBeenCalledWith(['ws-9'], {
      limit: undefined,
      cursor: undefined,
    });
  });

  it('lists nothing when the caller has no active workspace and no membership', async () => {
    const listProjectsInWorkspaces = vi.fn(() =>
      Promise.resolve<Page<ProjectRecord>>({ items: [], nextCursor: null }),
    );
    const controller = new ProjectController(
      fakeProjects({ listProjectsInWorkspaces }),
      fakeMemberships(null),
    );

    const page = await controller.list(sessionWithActive(null), {} as ProjectListQueryDto);

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
    const controller = new ProjectController(fakeProjects({}), fakeMemberships('ws-1'));
    const project = controller.get(record);
    expect(project.id).toBe('p1');
    expect(project.workspaceId).toBe('ws-1');
    expect(project.createdAt).toBe('2026-06-10T01:02:03.000Z');
  });
});
