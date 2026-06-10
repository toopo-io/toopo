/**
 * The webhook decision logic (ADR-0024 §4–§6) over mocked ports. This proves the
 * scope and side-effect contract WITHOUT the HTTP stack: only a push to the
 * default branch of a connected repo enqueues exactly one reference-only job,
 * deduped by `${projectId}:${commitSha}`; every other case does zero work — no
 * resolve and no enqueue (the cost guarantee the gate exists to protect).
 */
import type { EnqueueOutcome, ProjectRecord, ProjectRepository } from '@toopo/db';
import type { JobReference, Queue } from '@toopo/queue';
import type { Logger } from 'nestjs-pino';
import { ZodValidationException } from 'nestjs-zod';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GithubWebhookService } from './github-webhook.service';

const PROJECT_ID = 'project-123';
const COMMIT = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';

function projectRecord(): ProjectRecord {
  return {
    id: PROJECT_ID,
    ownerUserId: 'user-1',
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

let enqueue: ReturnType<typeof vi.fn>;
let findProjectByRepo: ReturnType<typeof vi.fn>;
let queue: Queue;
let projects: ProjectRepository;
let service: GithubWebhookService;

beforeEach(() => {
  enqueue = vi.fn(async (): Promise<EnqueueOutcome> => ({ id: 'job-1', deduplicated: false }));
  findProjectByRepo = vi.fn(async (): Promise<ProjectRecord | null> => projectRecord());
  queue = { enqueue } as unknown as Queue;
  projects = { findProjectByRepo } as unknown as ProjectRepository;
  const logger = { log: vi.fn(), warn: vi.fn() } as unknown as Logger;
  service = new GithubWebhookService(queue, projects, logger);
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
