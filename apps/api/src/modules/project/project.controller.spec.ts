import { NotFoundException } from '@nestjs/common';
import type { Page, ProjectRecord, ProjectRepository } from '@toopo/db';
import { describe, expect, it, vi } from 'vitest';
import { ProjectController } from './project.controller';
import { ProjectListQueryDto } from './project.dto';

const record: ProjectRecord = {
  id: 'p1',
  ownerUserId: 'u1',
  repoHost: 'github',
  repoOwner: 'acme',
  repoName: 'web',
  installationId: '42',
  archivedAt: null,
  createdAt: new Date('2026-06-10T01:02:03.000Z'),
  updatedAt: new Date('2026-06-10T04:05:06.000Z'),
};

function fakeProjects(overrides: Partial<ProjectRepository>): ProjectRepository {
  return {
    listProjects: vi.fn(() =>
      Promise.resolve<Page<ProjectRecord>>({ items: [], nextCursor: null }),
    ),
    findProjectById: vi.fn(() => Promise.resolve(null)),
    ...overrides,
  } as unknown as ProjectRepository;
}

describe('ProjectController.list', () => {
  it('maps records to the wire shape with ISO timestamps and forwards paging', async () => {
    const listProjects = vi.fn(() =>
      Promise.resolve<Page<ProjectRecord>>({ items: [record], nextCursor: 'c1' }),
    );
    const controller = new ProjectController(fakeProjects({ listProjects }));

    const page = await controller.list({ limit: 10, cursor: 'c0' } as ProjectListQueryDto);

    expect(listProjects).toHaveBeenCalledWith({ limit: 10, cursor: 'c0' });
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
});

describe('ProjectController.get', () => {
  it('returns the mapped project when it exists', async () => {
    const controller = new ProjectController(
      fakeProjects({ findProjectById: vi.fn(() => Promise.resolve(record)) }),
    );
    const project = await controller.get('p1');
    expect(project.id).toBe('p1');
    expect(project.createdAt).toBe('2026-06-10T01:02:03.000Z');
  });

  it('404s when the project does not exist', async () => {
    const controller = new ProjectController(
      fakeProjects({ findProjectById: vi.fn(() => Promise.resolve(null)) }),
    );
    await expect(controller.get('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
