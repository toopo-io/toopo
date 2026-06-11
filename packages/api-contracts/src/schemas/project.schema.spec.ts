import { describe, expect, it } from 'vitest';
import { projectApiPath, projectsApiPath, projectWorkspaceApiPath } from '../project-routes.js';
import {
  AssignProjectWorkspaceRequestSchema,
  ProjectListQuerySchema,
  ProjectPageSchema,
  ProjectResponseSchema,
} from './project.schema.js';

const project = {
  id: 'p1',
  ownerUserId: 'u1',
  repoHost: 'github',
  repoOwner: 'toopo',
  repoName: 'toopo',
  installationId: null,
  createdAt: '2026-06-10T00:00:00.000Z',
  updatedAt: '2026-06-10T00:00:00.000Z',
};

describe('ProjectResponseSchema', () => {
  it('accepts a connected-repo record with a null installation id', () => {
    expect(ProjectResponseSchema.parse(project).repoName).toBe('toopo');
  });

  it('rejects unknown keys (strict wire contract)', () => {
    expect(ProjectResponseSchema.safeParse({ ...project, secret: 'x' }).success).toBe(false);
  });
});

describe('ProjectPageSchema', () => {
  it('wraps projects in the keyset envelope', () => {
    const page = ProjectPageSchema.parse({ items: [project], nextCursor: null });
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBeNull();
  });
});

describe('ProjectListQuerySchema', () => {
  it('coerces a string limit and keeps an optional cursor', () => {
    expect(ProjectListQuerySchema.parse({ limit: '10' }).limit).toBe(10);
    expect(ProjectListQuerySchema.parse({}).cursor).toBeUndefined();
  });
});

describe('AssignProjectWorkspaceRequestSchema', () => {
  it('accepts a target workspace id', () => {
    expect(AssignProjectWorkspaceRequestSchema.parse({ workspaceId: 'ws-2' }).workspaceId).toBe(
      'ws-2',
    );
  });

  it('rejects an empty or missing workspace id', () => {
    expect(AssignProjectWorkspaceRequestSchema.safeParse({ workspaceId: '' }).success).toBe(false);
    expect(AssignProjectWorkspaceRequestSchema.safeParse({}).success).toBe(false);
  });

  it('rejects unknown keys (strict wire contract)', () => {
    expect(
      AssignProjectWorkspaceRequestSchema.safeParse({ workspaceId: 'ws-2', extra: 'x' }).success,
    ).toBe(false);
  });
});

describe('project route paths', () => {
  it('builds the list and single-project paths', () => {
    expect(projectsApiPath()).toBe('/v1/projects');
    expect(projectApiPath('p123')).toBe('/v1/projects/p123');
    expect(projectApiPath('a/b')).toBe('/v1/projects/a%2Fb');
  });

  it('builds the project-workspace path', () => {
    expect(projectWorkspaceApiPath('p123')).toBe('/v1/projects/p123/workspace');
    expect(projectWorkspaceApiPath('a/b')).toBe('/v1/projects/a%2Fb/workspace');
  });
});
