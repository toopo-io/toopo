import { NotFoundException } from '@nestjs/common';
import type { ProjectRecord } from '@toopo/db';
import type { GraphViewService } from '@toopo/serve';
import { describe, expect, it, vi } from 'vitest';
import { ProjectAccessGuard } from '../project/project-access.guard';
import { SessionGuard } from '../user/session.guard';
import { GraphController } from './graph.controller';
import type { GlobalListQueryDto, MapQueryDto, NodeQueryDto } from './graph.dto';

const project: ProjectRecord = {
  id: 'proj-123',
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

describe('GraphController scope threading', () => {
  it('scopes the map view by the resolved project id', async () => {
    const map = vi.fn(() =>
      Promise.resolve({ level: 'package' as const, nodes: [], edges: [], truncated: false }),
    );
    const controller = new GraphController({ map } as unknown as GraphViewService);

    const query = { level: 'package' } as MapQueryDto;
    await controller.map(project, query);

    expect(map).toHaveBeenCalledWith({ projectId: 'proj-123' }, query);
  });

  it('404s a missing node, having scoped the lookup by project', async () => {
    const nodeDetail = vi.fn(() => Promise.resolve(null));
    const controller = new GraphController({ nodeDetail } as unknown as GraphViewService);

    const query = { id: 'sym:absent' } as NodeQueryDto;
    await expect(controller.node(project, query)).rejects.toBeInstanceOf(NotFoundException);
    expect(nodeDetail).toHaveBeenCalledWith({ projectId: 'proj-123' }, query);
  });

  it('scopes the name-collisions view by the resolved project id (D5)', async () => {
    const nameCollisions = vi.fn(() => Promise.resolve({ items: [], nextCursor: null }));
    const controller = new GraphController({ nameCollisions } as unknown as GraphViewService);

    const query = { limit: 25 } as GlobalListQueryDto;
    await controller.nameCollisions(project, query);

    expect(nameCollisions).toHaveBeenCalledWith({ projectId: 'proj-123' }, query);
  });

  it('scopes the unused-symbols view by the resolved project id (D6)', async () => {
    const unusedSymbols = vi.fn(() => Promise.resolve({ items: [], nextCursor: null }));
    const controller = new GraphController({ unusedSymbols } as unknown as GraphViewService);

    const query = { limit: 25 } as GlobalListQueryDto;
    await controller.unusedSymbols(project, query);

    expect(unusedSymbols).toHaveBeenCalledWith({ projectId: 'proj-123' }, query);
  });
});

describe('GraphController guards (Fork 5 closure)', () => {
  it('gates every route behind the session guard and the project-access guard', () => {
    const guards = Reflect.getMetadata('__guards__', GraphController) as unknown[];
    expect(guards).toContain(SessionGuard);
    expect(guards).toContain(ProjectAccessGuard);
  });
});
