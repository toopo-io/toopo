/**
 * ADR-0028 §Phase 5 — proves the move endpoint's Option B gate end-to-end through
 * the REAL ProjectAccessGuard + handler, overriding only the SessionGuard (fixed
 * user) and the repositories. The move changes a project's ACCESS BOUNDARY, so the
 * gate is security-critical: a caller must OWN the source workspace AND be a MEMBER
 * of the target; same-workspace is a no-op that still requires ownership (Option A,
 * no triviality bypass); an unknown project is 404 before any check.
 *
 * The data-layer leak proof (workspace_id actually transferring access) lives in
 * `@toopo/db` workspace-move.integration.spec.ts; here we prove the HTTP gate.
 */
import { VersioningType } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { projectWorkspaceApiPath } from '@toopo/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { MEMBERSHIP_REPOSITORY, PROJECT_REPOSITORY } from '../src/modules/database/database.module';
import { SessionGuard } from '../src/modules/user/session.guard';
import { fakeMembershipRepository, fakeProjectRepository } from './support/fake-repositories';
import { E2E_PROJECT_ID, e2eProject, sessionAs } from './support/serving-app';

const UNKNOWN_PROJECT = 'no-such-project';
const SOURCE_WS = e2eProject.workspaceId; // 'ws-1'
const TARGET_WS = 'ws-2';

async function buildApp(
  memberOf: readonly string[],
  ownerOf: readonly string[],
): Promise<NestFastifyApplication> {
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideGuard(SessionGuard)
    .useValue(sessionAs('u1'))
    .overrideProvider(PROJECT_REPOSITORY)
    .useValue(fakeProjectRepository())
    .overrideProvider(MEMBERSHIP_REPOSITORY)
    .useValue(fakeMembershipRepository({ memberOf, ownerOf }))
    .compile();
  const app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

const moveUrl = (id: string) => projectWorkspaceApiPath(id);
const patch = (app: NestFastifyApplication, id: string, workspaceId: string) =>
  app.inject({ method: 'PATCH', url: moveUrl(id), payload: { workspaceId } });

describe('PATCH /v1/projects/:projectId/workspace — Option B gate (ADR-0028 §Phase 5)', () => {
  // Owner of the source AND member of the target — the happy path.
  let ownerApp: NestFastifyApplication;
  // A plain member of the source (passes the guard) who is NOT an owner.
  let memberOnlyApp: NestFastifyApplication;
  // Owner of the source but NOT a member of the target.
  let noTargetApp: NestFastifyApplication;

  beforeAll(async () => {
    ownerApp = await buildApp([SOURCE_WS, TARGET_WS], [SOURCE_WS]);
    memberOnlyApp = await buildApp([SOURCE_WS], []);
    noTargetApp = await buildApp([SOURCE_WS], [SOURCE_WS]);
  }, 60_000);

  afterAll(async () => {
    await ownerApp?.close();
    await memberOnlyApp?.close();
    await noTargetApp?.close();
  });

  it('source-owner + target-member → 200 (moved)', async () => {
    const res = await patch(ownerApp, E2E_PROJECT_ID, TARGET_WS);
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(E2E_PROJECT_ID);
  });

  it('source-member non-owner → 403', async () => {
    const res = await patch(memberOnlyApp, E2E_PROJECT_ID, TARGET_WS);
    expect(res.statusCode).toBe(403);
  });

  it('non-member of the target → 403 (no leak)', async () => {
    const res = await patch(noTargetApp, E2E_PROJECT_ID, TARGET_WS);
    expect(res.statusCode).toBe(403);
  });

  it('same-workspace → 200 no-op (still requires ownership, Option A)', async () => {
    const ok = await patch(ownerApp, E2E_PROJECT_ID, SOURCE_WS);
    expect(ok.statusCode).toBe(200);
    expect(ok.json().id).toBe(E2E_PROJECT_ID);
    // A non-owner same-workspace call is still 403 — triviality is no bypass.
    const denied = await patch(memberOnlyApp, E2E_PROJECT_ID, SOURCE_WS);
    expect(denied.statusCode).toBe(403);
  });

  it('unknown project → 404 (before any membership check)', async () => {
    const res = await patch(ownerApp, UNKNOWN_PROJECT, TARGET_WS);
    expect(res.statusCode).toBe(404);
  });

  it('missing workspaceId → 400 (strict body contract)', async () => {
    const res = await ownerApp.inject({
      method: 'PATCH',
      url: moveUrl(E2E_PROJECT_ID),
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});
