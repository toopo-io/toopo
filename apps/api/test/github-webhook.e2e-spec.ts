/**
 * ADR-0024 — the GitHub push-webhook receiver over the REAL HTTP stack (Nest +
 * Fastify, raw-body capture, the global filter). Two booted apps prove the two
 * halves of the security contract:
 *
 *  - the CONFIGURED app has a webhook secret, a real in-memory queue, and a
 *    project repo that knows one connected repo. It proves: a valid signature
 *    enqueues exactly one reference-only job; a tampered body / wrong secret /
 *    missing or malformed header is rejected with ZERO resolve and ZERO enqueue
 *    (the cost guarantee); a redelivery (new delivery id, same commit) is
 *    deduplicated to one logical job; non-default-branch / tag / delete / non-push
 *    and an unconnected repo are acknowledged 200 with no enqueue.
 *  - the UNCONFIGURED app has no secret and fails closed: every request is 503
 *    with no work done.
 *
 * The queue is the real `@toopo/queue` in-memory impl, so "one job" is asserted
 * by claiming from its store — an end-to-end proof, not a mock count.
 */
import { createHmac } from 'node:crypto';
import { VersioningType } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { ProjectRecord, ProjectRepository } from '@toopo/db';
import { createInMemoryQueue, type InMemoryQueueHandle, type Queue } from '@toopo/queue';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import {
  GITHUB_INSTALLATION_REPOSITORY,
  PROJECT_REPOSITORY,
} from '../src/modules/database/database.module';
import { GithubInstallService } from '../src/modules/github/github-install.service';
import { QueueService } from '../src/modules/queue/queue.module';
import { GITHUB_WEBHOOK_MAX_PAYLOAD_BYTES } from '../src/modules/webhooks/github-webhook.constants';
import { GITHUB_WEBHOOK_SECRET } from '../src/modules/webhooks/github-webhook.tokens';

const SECRET = 'e2e-webhook-secret-0123456789abcdef';
const WEBHOOK_URL = '/v1/webhooks/github';
const PROJECT_ID = 'e2e-project-web';
const COMMIT = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';

function connectedProject(): ProjectRecord {
  return {
    id: PROJECT_ID,
    ownerUserId: 'u1',
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

/** A realistic-enough push payload; overrides tweak ref/after/deleted/repo. */
function pushBody(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    ref: 'refs/heads/main',
    before: '0'.repeat(40),
    after: COMMIT,
    repository: {
      name: 'web',
      full_name: 'acme/web',
      default_branch: 'main',
      owner: { login: 'acme', id: 1 },
    },
    pusher: { name: 'octocat' },
    ...overrides,
  });
}

function sign(payload: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(Buffer.from(payload, 'utf8')).digest('hex')}`;
}

// One in-memory queue per test, reached through a stable forwarding queue so the
// app is booted once but each test asserts against a fresh, isolated store.
let queueHandle: InMemoryQueueHandle;
const forwardingQueue: Queue = {
  enqueue: (reference, options) => queueHandle.queue.enqueue(reference, options),
};

type FindProjectByRepo = ProjectRepository['findProjectByRepo'];
let findProjectByRepo: ReturnType<typeof vi.fn<FindProjectByRepo>>;
const projectsStub = {
  findProjectByRepo: (host: string, owner: string, name: string) =>
    findProjectByRepo(host, owner, name),
} as unknown as ProjectRepository;

// Installation-flow stubs (ADR-0026 §3): the install service and link store are
// driven through forwarders so the booted app stays DB-free while each test pins
// whether the installation is linked and asserts the provisioning side effects.
let findInstallation: ReturnType<typeof vi.fn<(id: string) => Promise<unknown>>>;
let provisionRepos: ReturnType<
  typeof vi.fn<(id: number, owner: string, repos: unknown) => Promise<number>>
>;
let archiveInstallationProjects: ReturnType<typeof vi.fn<(id: string) => Promise<number>>>;
let deleteInstallation: ReturnType<typeof vi.fn<(id: string) => Promise<void>>>;
const installationsStub = {
  findInstallation: (id: string) => findInstallation(id),
  deleteInstallation: (id: string) => deleteInstallation(id),
};
const installStub = {
  provisionRepos: (id: number, owner: string, repos: unknown) => provisionRepos(id, owner, repos),
  archiveInstallationProjects: (id: string) => archiveInstallationProjects(id),
  archiveRepo: async () => false,
};

async function bootWebhookApp(secret: string | undefined): Promise<NestFastifyApplication> {
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(QueueService)
    .useValue({ queue: forwardingQueue })
    .overrideProvider(PROJECT_REPOSITORY)
    .useValue(projectsStub)
    .overrideProvider(GITHUB_INSTALLATION_REPOSITORY)
    .useValue(installationsStub)
    .overrideProvider(GithubInstallService)
    .useValue(installStub)
    .overrideProvider(GITHUB_WEBHOOK_SECRET)
    .useValue(secret)
    .compile();
  const app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
    rawBody: true,
  });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useBodyParser('application/json', { bodyLimit: GITHUB_WEBHOOK_MAX_PAYLOAD_BYTES });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

interface PostInit {
  readonly payload: string;
  readonly signature?: string;
  readonly event?: string;
  readonly delivery?: string;
}

function post(app: NestFastifyApplication, init: PostInit) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-github-event': init.event ?? 'push',
    'x-github-delivery': init.delivery ?? 'delivery-1',
  };
  if (init.signature !== undefined) headers['x-hub-signature-256'] = init.signature;
  return app.inject({ method: 'POST', url: WEBHOOK_URL, headers, payload: init.payload });
}

/** Claim the single next job from the test's queue, or null when empty. */
function claimOne() {
  return queueHandle.store.claim({ leaseMs: 1_000, now: new Date() });
}

beforeEach(() => {
  queueHandle = createInMemoryQueue();
  findProjectByRepo = vi.fn<FindProjectByRepo>(async () => connectedProject());
  findInstallation = vi.fn(async () => ({
    installationId: '55',
    ownerUserId: 'u1',
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
  provisionRepos = vi.fn(async () => 1);
  archiveInstallationProjects = vi.fn(async () => 1);
  deleteInstallation = vi.fn(async () => undefined);
});

/** A signed installation-event body (created/deleted), one granted repo. */
function installationBody(action: string): string {
  return JSON.stringify({
    action,
    installation: { id: 55, account: { login: 'acme' } },
    repositories: [{ name: 'web', full_name: 'acme/web' }],
  });
}

describe('GitHub webhook (e2e) — secret configured', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await bootWebhookApp(SECRET);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  it('enqueues exactly one reference-only job for a valid default-branch push', async () => {
    const payload = pushBody();
    const response = await post(app, { payload, signature: sign(payload, SECRET) });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'enqueued', deduplicated: false });

    const job = await claimOne();
    expect(job).not.toBeNull();
    expect(job?.projectId).toBe(PROJECT_ID);
    expect(job?.commitSha).toBe(COMMIT);
    expect(await claimOne()).toBeNull();
  });

  it('rejects a tampered body with 403 and does NO work (the HMAC proof)', async () => {
    const signedPayload = pushBody();
    const signature = sign(signedPayload, SECRET);
    const tamperedPayload = pushBody({ after: 'b'.repeat(40) });

    const response = await post(app, { payload: tamperedPayload, signature });

    expect(response.statusCode).toBe(403);
    expect(findProjectByRepo).not.toHaveBeenCalled();
    expect(await claimOne()).toBeNull();
  });

  it('rejects a missing signature with 401 and does NO work', async () => {
    const response = await post(app, { payload: pushBody() });
    expect(response.statusCode).toBe(401);
    expect(findProjectByRepo).not.toHaveBeenCalled();
    expect(await claimOne()).toBeNull();
  });

  it('rejects a wrong-secret signature with 403 and does NO work', async () => {
    const payload = pushBody();
    const response = await post(app, {
      payload,
      signature: sign(payload, 'the-wrong-secret-xxxxxxxx'),
    });
    expect(response.statusCode).toBe(403);
    expect(findProjectByRepo).not.toHaveBeenCalled();
    expect(await claimOne()).toBeNull();
  });

  it('rejects a malformed signature header with 403 and never throws (timingSafeEqual trap)', async () => {
    const payload = pushBody();
    const response = await post(app, { payload, signature: `sha256=${'€'.repeat(64)}` });
    expect(response.statusCode).toBe(403);
    expect(await claimOne()).toBeNull();
  });

  it('rejects a wrong-algorithm prefix with 403', async () => {
    const payload = pushBody();
    const hex = createHmac('sha256', SECRET).update(Buffer.from(payload, 'utf8')).digest('hex');
    const response = await post(app, { payload, signature: `sha1=${hex}` });
    expect(response.statusCode).toBe(403);
    expect(await claimOne()).toBeNull();
  });

  it('deduplicates a redelivery (new delivery id, same commit) to one logical job', async () => {
    const payload = pushBody();
    const signature = sign(payload, SECRET);

    const first = await post(app, { payload, signature, delivery: 'delivery-A' });
    const second = await post(app, { payload, signature, delivery: 'delivery-B' });

    expect(first.json()).toEqual({ status: 'enqueued', deduplicated: false });
    expect(second.json()).toEqual({ status: 'enqueued', deduplicated: true });
    expect(await claimOne()).not.toBeNull();
    expect(await claimOne()).toBeNull();
  });

  it('acknowledges a non-default-branch push with 200 and no enqueue', async () => {
    const payload = pushBody({ ref: 'refs/heads/feature' });
    const response = await post(app, { payload, signature: sign(payload, SECRET) });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ignored' });
    expect(findProjectByRepo).not.toHaveBeenCalled();
    expect(await claimOne()).toBeNull();
  });

  it('acknowledges a tag push with 200 and no enqueue', async () => {
    const payload = pushBody({ ref: 'refs/tags/v1.0.0' });
    const response = await post(app, { payload, signature: sign(payload, SECRET) });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ignored' });
    expect(await claimOne()).toBeNull();
  });

  it('acknowledges a branch delete with 200 and no enqueue', async () => {
    const payload = pushBody({ deleted: true, after: '0'.repeat(40) });
    const response = await post(app, { payload, signature: sign(payload, SECRET) });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ignored' });
    expect(await claimOne()).toBeNull();
  });

  it('acknowledges a non-push event (ping) with 200 and no enqueue', async () => {
    const payload = JSON.stringify({ zen: 'Keep it logically awesome.', hook_id: 1 });
    const response = await post(app, { payload, signature: sign(payload, SECRET), event: 'ping' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'acknowledged' });
    expect(findProjectByRepo).not.toHaveBeenCalled();
    expect(await claimOne()).toBeNull();
  });

  it('acknowledges a push for an unconnected repo (resolve miss) with 200 and no enqueue', async () => {
    findProjectByRepo.mockResolvedValueOnce(null);
    const payload = pushBody();
    const response = await post(app, { payload, signature: sign(payload, SECRET) });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ignored' });
    expect(findProjectByRepo).toHaveBeenCalledTimes(1);
    expect(await claimOne()).toBeNull();
  });

  it('rejects a malformed push payload with 400 and no enqueue', async () => {
    const payload = JSON.stringify({ ref: 'refs/heads/main' });
    const response = await post(app, { payload, signature: sign(payload, SECRET) });
    expect(response.statusCode).toBe(400);
    expect(await claimOne()).toBeNull();
  });

  it('verifies and provisions a signed installation.created (fixture-signed, ADR-0026 §3)', async () => {
    const payload = installationBody('created');
    const response = await post(app, {
      payload,
      signature: sign(payload, SECRET),
      event: 'installation',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'acknowledged' });
    expect(provisionRepos).toHaveBeenCalledWith(55, 'u1', [{ owner: 'acme', name: 'web' }]);
  });

  it('rejects a tampered installation event with 403 and does NO provisioning', async () => {
    const signature = sign(installationBody('created'), SECRET);
    const response = await post(app, {
      payload: installationBody('deleted'),
      signature,
      event: 'installation',
    });
    expect(response.statusCode).toBe(403);
    expect(provisionRepos).not.toHaveBeenCalled();
    expect(archiveInstallationProjects).not.toHaveBeenCalled();
  });

  it('archives on a signed installation.deleted and drops the link', async () => {
    const payload = installationBody('deleted');
    const response = await post(app, {
      payload,
      signature: sign(payload, SECRET),
      event: 'installation',
    });
    expect(response.statusCode).toBe(200);
    expect(archiveInstallationProjects).toHaveBeenCalledWith('55');
    expect(deleteInstallation).toHaveBeenCalledWith('55');
  });
});

describe('GitHub webhook (e2e) — secret not configured (fail closed)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await bootWebhookApp(undefined);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  it('rejects every request with 503 and does NO work, even a correctly-signed one', async () => {
    const payload = pushBody();
    const response = await post(app, { payload, signature: sign(payload, SECRET) });
    expect(response.statusCode).toBe(503);
    expect(findProjectByRepo).not.toHaveBeenCalled();
    expect(await claimOne()).toBeNull();
  });
});
