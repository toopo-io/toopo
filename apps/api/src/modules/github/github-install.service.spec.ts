import { ConflictException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import type {
  GithubInstallationRepository,
  MembershipRepository,
  ProjectRecord,
  ProjectRepository,
} from '@toopo/db';
import type { GithubAppAuth, InstallationRepo } from '@toopo/github-app';
import type { Queue } from '@toopo/queue';
import type { Logger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GithubInstallService } from './github-install.service';
import { signInstallState } from './install-state';

const SECRET = 'install-state-secret-at-least-32-chars!';
const SLUG = 'toopo-dev';
const USER = 'user-1';
const WORKSPACE = 'ws-1';

function projectRecord(overrides: Partial<ProjectRecord>): ProjectRecord {
  return {
    id: 'p-existing',
    ownerUserId: USER,
    workspaceId: WORKSPACE,
    repoHost: 'github.com',
    repoOwner: 'acme',
    repoName: 'api',
    installationId: '55',
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

interface Harness {
  service: GithubInstallService;
  auth: GithubAppAuth;
  projects: { [K in keyof ProjectRepository]: ReturnType<typeof vi.fn> };
  memberships: {
    listWorkspaceIds: ReturnType<typeof vi.fn>;
  };
  installations: {
    linkInstallation: ReturnType<typeof vi.fn>;
    findInstallation: ReturnType<typeof vi.fn>;
    deleteInstallation: ReturnType<typeof vi.fn>;
  };
  queue: { enqueue: ReturnType<typeof vi.fn> };
}

function harness(options?: {
  authConfigured?: boolean;
  slug?: string | undefined;
  repos?: readonly InstallationRepo[];
  findProjectByRepo?: (owner: string, name: string) => ProjectRecord | null;
  /** The workspaces the owner belongs to — drives attribution (the earliest) and
   * the per-repo re-home check (membership of the existing project's workspace).
   * Defaults to a single workspace; an empty array means the owner has none. */
  memberWorkspaceIds?: readonly string[];
}): Harness {
  const repos = options?.repos ?? [{ owner: 'acme', name: 'web' }];
  const auth: GithubAppAuth = {
    mintInstallationToken: vi.fn(),
    listInstallationRepos: vi.fn(async () => repos),
    resolveDefaultBranchHead: vi.fn(async () => ({ defaultBranch: 'main', commitSha: 'sha-head' })),
  };
  const projects = {
    createProject: vi.fn(async () => projectRecord({ id: 'p-new' })),
    findProjectById: vi.fn(),
    findProjectByRepo: vi.fn(async (_host: string, owner: string, name: string) =>
      options?.findProjectByRepo ? options.findProjectByRepo(owner, name) : null,
    ),
    findProjectsByInstallationId: vi.fn(),
    archiveProject: vi.fn(),
    reviveProject: vi.fn(),
    assignProjectToWorkspace: vi.fn(),
    listProjectsInWorkspaces: vi.fn(),
  };
  const memberWorkspaceIds = options?.memberWorkspaceIds ?? [WORKSPACE];
  const memberships = {
    listWorkspaceIds: vi.fn(async () => memberWorkspaceIds),
  };
  const installations = {
    linkInstallation: vi.fn(async () => ({ outcome: 'linked', record: {} })),
    findInstallation: vi.fn(),
    deleteInstallation: vi.fn(),
  };
  const queue = { enqueue: vi.fn(async () => ({ id: 'job-1', deduplicated: false })) };
  const logger = { log: vi.fn() } as unknown as Logger;

  const service = new GithubInstallService(
    options?.authConfigured === false ? null : auth,
    'slug' in (options ?? {}) ? options?.slug : SLUG,
    SECRET,
    projects as unknown as ProjectRepository,
    memberships as unknown as MembershipRepository,
    installations as unknown as GithubInstallationRepository,
    queue as unknown as Queue,
    logger,
  );
  return { service, auth, projects, memberships, installations, queue };
}

describe('GithubInstallService.buildInstallUrl', () => {
  it('returns a signed, session-bound install URL', () => {
    const { service } = harness();
    const { url } = service.buildInstallUrl(USER);
    expect(url.startsWith(`https://github.com/apps/${SLUG}/installations/new?state=`)).toBe(true);
  });

  it('fails closed with 503 when the App is unconfigured', () => {
    const { service } = harness({ authConfigured: false });
    expect(() => service.buildInstallUrl(USER)).toThrow(ServiceUnavailableException);
  });

  it('fails closed with 503 when the slug is unset', () => {
    const { service } = harness({ slug: undefined });
    expect(() => service.buildInstallUrl(USER)).toThrow(ServiceUnavailableException);
  });
});

describe('GithubInstallService.completeInstall', () => {
  let validState: string;
  beforeEach(() => {
    validState = signInstallState(SECRET, USER, new Date());
  });

  it('links the installation and provisions a new repo with a first scan', async () => {
    const { service, installations, projects, queue } = harness({
      repos: [{ owner: 'acme', name: 'web' }],
    });

    const result = await service.completeInstall({
      installationId: '55',
      setupAction: 'install',
      state: validState,
      sessionUserId: USER,
    });

    expect(result).toEqual({ linked: true, projectsConnected: 1 });
    expect(installations.linkInstallation).toHaveBeenCalledWith({
      installationId: '55',
      ownerUserId: USER,
    });
    expect(projects.createProject).toHaveBeenCalledWith({
      ownerUserId: USER,
      workspaceId: WORKSPACE,
      repoHost: 'github.com',
      repoOwner: 'acme',
      repoName: 'web',
      installationId: '55',
    });
    expect(queue.enqueue).toHaveBeenCalledWith(
      {
        projectId: 'p-new',
        repo: { host: 'github.com', owner: 'acme', name: 'web' },
        commitSha: 'sha-head',
      },
      { dedupeKey: 'p-new:sha-head' },
    );
  });

  it('revives an existing (possibly archived) repo instead of creating a duplicate', async () => {
    const { service, projects, queue } = harness({
      repos: [{ owner: 'acme', name: 'api' }],
      findProjectByRepo: () => projectRecord({ id: 'p-existing', archivedAt: new Date() }),
    });

    await service.completeInstall({
      installationId: '55',
      setupAction: 'install',
      state: validState,
      sessionUserId: USER,
    });

    // Owner is a member of the project's current workspace → no re-home (undefined).
    expect(projects.reviveProject).toHaveBeenCalledWith('p-existing', '55', undefined);
    expect(projects.createProject).not.toHaveBeenCalled();
    expect(queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'p-existing' }),
      { dedupeKey: 'p-existing:sha-head' },
    );
  });

  it('re-homes a revived project the owner cannot reach (orphan → owner reclaims)', async () => {
    const { service, projects, memberships } = harness({
      repos: [{ owner: 'acme', name: 'api' }],
      findProjectByRepo: () =>
        projectRecord({
          id: 'p-orphan',
          workspaceId: 'orphaned-workspace',
          archivedAt: new Date(),
        }),
      // The owner belongs only to WORKSPACE — NOT to the orphaned workspace.
    });

    await service.completeInstall({
      installationId: '55',
      setupAction: 'install',
      state: validState,
      sessionUserId: USER,
    });

    // Membership is resolved once for the owner; the persisted workspace is not in
    // the set, so the project is re-homed to the owner's resolved workspace.
    expect(memberships.listWorkspaceIds).toHaveBeenCalledWith(USER);
    expect(projects.reviveProject).toHaveBeenCalledWith('p-orphan', '55', WORKSPACE);
  });

  it('leaves a revived project where it is when the owner already belongs there', async () => {
    const { service, projects } = harness({
      repos: [{ owner: 'acme', name: 'api' }],
      findProjectByRepo: () =>
        projectRecord({ id: 'p-team', workspaceId: 'ws-team', archivedAt: new Date() }),
      // The owner belongs to the team workspace the project already lives in.
      memberWorkspaceIds: [WORKSPACE, 'ws-team'],
    });

    await service.completeInstall({
      installationId: '55',
      setupAction: 'install',
      state: validState,
      sessionUserId: USER,
    });

    // Deliberate placement in a workspace the owner belongs to → never re-homed.
    expect(projects.reviveProject).toHaveBeenCalledWith('p-team', '55', undefined);
  });

  it('attributes the created project to the owner resolved workspace', async () => {
    const { service, memberships } = harness({ repos: [{ owner: 'acme', name: 'web' }] });
    await service.completeInstall({
      installationId: '55',
      setupAction: 'install',
      state: validState,
      sessionUserId: USER,
    });
    expect(memberships.listWorkspaceIds).toHaveBeenCalledWith(USER);
  });

  it('connects NOTHING when the owner has no workspace (never fabricates one)', async () => {
    const { service, projects, queue } = harness({
      repos: [{ owner: 'acme', name: 'web' }],
      memberWorkspaceIds: [],
    });
    await expect(
      service.completeInstall({
        installationId: '55',
        setupAction: 'install',
        state: validState,
        sessionUserId: USER,
      }),
    ).rejects.toThrow(/no workspace/);
    expect(projects.createProject).not.toHaveBeenCalled();
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('rejects a session-mismatched state and links NOTHING (install-hijack defense)', async () => {
    const { service, installations, queue } = harness();
    const attackerState = signInstallState(SECRET, 'attacker', new Date());

    await expect(
      service.completeInstall({
        installationId: '55',
        setupAction: 'install',
        state: attackerState,
        sessionUserId: 'victim',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(installations.linkInstallation).not.toHaveBeenCalled();
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('rejects a forged state and links nothing', async () => {
    const { service, installations } = harness();
    await expect(
      service.completeInstall({
        installationId: '55',
        setupAction: 'install',
        state: 'forged.token',
        sessionUserId: USER,
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(installations.linkInstallation).not.toHaveBeenCalled();
  });

  it('rejects with 409 an installation already linked to a DIFFERENT user and provisions nothing', async () => {
    const { service, installations, auth, projects, queue } = harness();
    installations.linkInstallation.mockResolvedValueOnce({ outcome: 'owner-mismatch' });

    await expect(
      service.completeInstall({
        installationId: '55',
        setupAction: 'install',
        state: validState,
        sessionUserId: USER,
      }),
    ).rejects.toThrow(ConflictException);
    // Nothing downstream of the refused link may run: no repo listing with the
    // App JWT, no project creation or revival, no scan enqueued.
    expect(auth.listInstallationRepos).not.toHaveBeenCalled();
    expect(projects.createProject).not.toHaveBeenCalled();
    expect(projects.reviveProject).not.toHaveBeenCalled();
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('fails closed with 503 when the App is unconfigured', async () => {
    const { service } = harness({ authConfigured: false });
    await expect(
      service.completeInstall({
        installationId: '55',
        setupAction: 'install',
        state: validState,
        sessionUserId: USER,
      }),
    ).rejects.toThrow(ServiceUnavailableException);
  });
});
