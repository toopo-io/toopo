/**
 * The webhook decision logic (ADR-0024 §4–§6) over mocked ports. This proves the
 * scope and side-effect contract WITHOUT the HTTP stack: only a push to the
 * default branch of a connected repo enqueues exactly one reference-only job,
 * deduped by `${projectId}:${commitSha}`; every other case does zero work — no
 * resolve and no enqueue (the cost guarantee the gate exists to protect).
 */
import type {
  EnqueueOutcome,
  GithubInstallationRecord,
  GithubInstallationRepository,
  ProjectRecord,
  ProjectRepository,
} from '@toopo/db';
import type { JobReference, Queue } from '@toopo/queue';
import type { Logger } from 'nestjs-pino';
import { ZodValidationException } from 'nestjs-zod';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GithubInstallService } from '../github/github-install.service';
import { GithubWebhookService } from './github-webhook.service';

const PROJECT_ID = 'project-123';
const COMMIT = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';

function projectRecord(): ProjectRecord {
  return {
    id: PROJECT_ID,
    ownerUserId: 'user-1',
    workspaceId: 'ws-1',
    repoHost: 'github.com',
    repoOwner: 'acme',
    repoName: 'web',
    installationId: null,
    archivedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

/** The verified raw body a push delivery would carry, with optional overrides. */
function pushPayload(overrides: Record<string, unknown> = {}): Buffer {
  return Buffer.from(
    JSON.stringify({
      ref: 'refs/heads/main',
      after: COMMIT,
      repository: {
        name: 'web',
        default_branch: 'main',
        owner: { login: 'acme' },
      },
      ...overrides,
    }),
  );
}

/** An installation event raw body (created / deleted / suspend / unsuspend). */
function installationPayload(action: string, fullNames: readonly string[] = ['acme/web']): Buffer {
  return Buffer.from(
    JSON.stringify({
      action,
      installation: { id: 55, account: { login: 'acme' } },
      repositories: fullNames.map((full_name) => ({ name: full_name.split('/')[1], full_name })),
    }),
  );
}

/** An installation_repositories event raw body (added / removed). */
function installationReposPayload(
  action: 'added' | 'removed',
  fullNames: readonly string[],
): Buffer {
  const repos = fullNames.map((full_name) => ({ name: full_name.split('/')[1], full_name }));
  return Buffer.from(
    JSON.stringify({
      action,
      installation: { id: 55 },
      ...(action === 'added' ? { repositories_added: repos } : { repositories_removed: repos }),
    }),
  );
}

let enqueue: ReturnType<typeof vi.fn>;
let findProjectByRepo: ReturnType<typeof vi.fn>;
let findInstallation: ReturnType<typeof vi.fn>;
let deleteInstallation: ReturnType<typeof vi.fn>;
let provisionRepos: ReturnType<typeof vi.fn>;
let archiveInstallationProjects: ReturnType<typeof vi.fn>;
let archiveRepo: ReturnType<typeof vi.fn>;
let queue: Queue;
let projects: ProjectRepository;
let installations: GithubInstallationRepository;
let install: GithubInstallService;
let service: GithubWebhookService;

beforeEach(() => {
  enqueue = vi.fn(async (): Promise<EnqueueOutcome> => ({ id: 'job-1', deduplicated: false }));
  findProjectByRepo = vi.fn(async (): Promise<ProjectRecord | null> => projectRecord());
  findInstallation = vi.fn(
    async (): Promise<GithubInstallationRecord | null> => ({
      installationId: '55',
      ownerUserId: 'user-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
  );
  deleteInstallation = vi.fn(async () => undefined);
  provisionRepos = vi.fn(async () => 1);
  archiveInstallationProjects = vi.fn(async () => 2);
  archiveRepo = vi.fn(async () => true);
  queue = { enqueue } as unknown as Queue;
  projects = { findProjectByRepo } as unknown as ProjectRepository;
  installations = {
    findInstallation,
    deleteInstallation,
  } as unknown as GithubInstallationRepository;
  install = {
    provisionRepos,
    archiveInstallationProjects,
    archiveRepo,
  } as unknown as GithubInstallService;
  const logger = { log: vi.fn(), warn: vi.fn() } as unknown as Logger;
  service = new GithubWebhookService(queue, projects, installations, install, logger);
});

describe('GithubWebhookService', () => {
  it('enqueues exactly one reference-only job for a default-branch push to a connected repo', async () => {
    const result = await service.handle('push', 'd1', pushPayload());

    expect(result).toEqual({ status: 'enqueued', deduplicated: false });
    expect(enqueue).toHaveBeenCalledTimes(1);
    const [reference, options] = enqueue.mock.calls[0] as [JobReference, { dedupeKey: string }];
    expect(reference).toEqual({
      projectId: PROJECT_ID,
      repo: { host: 'github.com', owner: 'acme', name: 'web' },
      commitSha: COMMIT,
    });
    expect(options).toEqual({ dedupeKey: `${PROJECT_ID}:${COMMIT}` });
  });

  it('surfaces deduplicated=true when the queue coalesces a redelivery (same work unit)', async () => {
    enqueue.mockResolvedValueOnce({ id: 'job-1', deduplicated: true });
    const result = await service.handle('push', 'redelivery', pushPayload());
    expect(result).toEqual({ status: 'enqueued', deduplicated: true });
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it('ignores a push to a non-default branch — no resolve, no enqueue', async () => {
    const result = await service.handle('push', 'd1', pushPayload({ ref: 'refs/heads/feature' }));
    expect(result.status).toBe('ignored');
    expect(findProjectByRepo).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('ignores a tag push — no resolve, no enqueue', async () => {
    const result = await service.handle('push', 'd1', pushPayload({ ref: 'refs/tags/v1.0.0' }));
    expect(result.status).toBe('ignored');
    expect(findProjectByRepo).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('ignores a branch delete flagged by `deleted` — no resolve, no enqueue', async () => {
    const result = await service.handle('push', 'd1', pushPayload({ deleted: true }));
    expect(result.status).toBe('ignored');
    expect(findProjectByRepo).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('ignores a branch delete carrying the all-zero sha — no resolve, no enqueue', async () => {
    const result = await service.handle('push', 'd1', pushPayload({ after: '0'.repeat(40) }));
    expect(result.status).toBe('ignored');
    expect(findProjectByRepo).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('acknowledges a non-push event without parsing the body — no resolve, no enqueue', async () => {
    const result = await service.handle(
      'ping',
      'd1',
      Buffer.from(JSON.stringify({ zen: 'Keep it logically awesome.' })),
    );
    expect(result.status).toBe('acknowledged');
    expect(findProjectByRepo).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('ignores a push for an unconnected repo (resolve miss) — no enqueue', async () => {
    findProjectByRepo.mockResolvedValueOnce(null);
    const result = await service.handle('push', 'd1', pushPayload());
    expect(result.status).toBe('ignored');
    expect(findProjectByRepo).toHaveBeenCalledTimes(1);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('throws a 400 (ZodValidationException) on a malformed push payload — no enqueue', async () => {
    const malformed = Buffer.from(JSON.stringify({ ref: 'refs/heads/main' }));
    await expect(service.handle('push', 'd1', malformed)).rejects.toBeInstanceOf(
      ZodValidationException,
    );
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('throws a 400 (BadRequestException) on non-JSON or empty body — no enqueue', async () => {
    await expect(service.handle('push', 'd1', Buffer.from('not json'))).rejects.toMatchObject({
      status: 400,
    });
    await expect(service.handle('push', 'd1', undefined)).rejects.toMatchObject({ status: 400 });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('resolves against the canonical host github.com', async () => {
    await service.handle('push', 'd1', pushPayload());
    expect(findProjectByRepo).toHaveBeenCalledWith('github.com', 'acme', 'web');
  });
});

describe('GithubWebhookService — installation events', () => {
  it('provisions the granted repos on installation.created for a linked installation', async () => {
    const result = await service.handle('installation', 'd1', installationPayload('created'));
    expect(result.status).toBe('acknowledged');
    expect(provisionRepos).toHaveBeenCalledWith(55, 'user-1', [{ owner: 'acme', name: 'web' }]);
  });

  it('IGNORES installation.created for an UNLINKED installation — fabricates no owner', async () => {
    findInstallation.mockResolvedValueOnce(null);
    const result = await service.handle('installation', 'd1', installationPayload('created'));
    expect(result.status).toBe('ignored');
    expect(provisionRepos).not.toHaveBeenCalled();
  });

  it('archives the installation projects and drops the link on installation.deleted', async () => {
    const result = await service.handle('installation', 'd1', installationPayload('deleted'));
    expect(result.status).toBe('acknowledged');
    expect(archiveInstallationProjects).toHaveBeenCalledWith('55');
    expect(deleteInstallation).toHaveBeenCalledWith('55');
  });

  it('archives but keeps the link on installation.suspend', async () => {
    await service.handle('installation', 'd1', installationPayload('suspend'));
    expect(archiveInstallationProjects).toHaveBeenCalledWith('55');
    expect(deleteInstallation).not.toHaveBeenCalled();
  });

  it('acknowledges an unhandled installation action without side effects', async () => {
    const result = await service.handle(
      'installation',
      'd1',
      installationPayload('new_permissions_accepted'),
    );
    expect(result.status).toBe('acknowledged');
    expect(provisionRepos).not.toHaveBeenCalled();
    expect(archiveInstallationProjects).not.toHaveBeenCalled();
  });

  it('provisions added repos on installation_repositories.added', async () => {
    const result = await service.handle(
      'installation_repositories',
      'd1',
      installationReposPayload('added', ['acme/web', 'acme/api']),
    );
    expect(result.status).toBe('acknowledged');
    expect(provisionRepos).toHaveBeenCalledWith(55, 'user-1', [
      { owner: 'acme', name: 'web' },
      { owner: 'acme', name: 'api' },
    ]);
  });

  it('archives removed repos on installation_repositories.removed', async () => {
    const result = await service.handle(
      'installation_repositories',
      'd1',
      installationReposPayload('removed', ['acme/web']),
    );
    expect(result.status).toBe('acknowledged');
    expect(archiveRepo).toHaveBeenCalledWith('acme', 'web');
    expect(provisionRepos).not.toHaveBeenCalled();
  });
});
