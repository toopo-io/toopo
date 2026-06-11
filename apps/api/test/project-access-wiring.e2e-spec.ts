/**
 * ADR-0028 §Phase 3 — proves the membership authorization is WIRED, not merely
 * correct in isolation. Unlike the serving e2e (which bypasses the guards with
 * `projectInjector`), this boots the app with the REAL ProjectAccessGuard and
 * overrides only the SessionGuard (to inject a known user) and the repositories.
 *
 * A future silent guard removal would pass the guard-unit tests AND a bypassed
 * e2e — these tests are what would catch it: a real route, a real guard, a
 * member → 200 and a non-member → 403, across every guarded surface (a graph
 * route and both ProjectController routes).
 */
import { VersioningType } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import {
  GRAPH_SEGMENTS,
  graphApiPath,
  projectApiPath,
  projectsApiPath,
} from '@toopo/api-contracts';
import type { GraphRepository } from '@toopo/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import {
  GRAPH_REPOSITORY,
  MEMBERSHIP_REPOSITORY,
  PROJECT_REPOSITORY,
} from '../src/modules/database/database.module';
import { SessionGuard } from '../src/modules/user/session.guard';
import { fakeMembershipRepository, fakeProjectRepository } from './support/fake-repositories';
import { type SeededGraph, seedGraphDatabase } from './support/graph-backend';
import { graphFixture } from './support/graph-fixture';
import { E2E_PROJECT_ID, e2eProject, sessionAs } from './support/serving-app';

const UNKNOWN_PROJECT = 'no-such-project';

async function buildApp(
  isMember: boolean,
  graph: GraphRepository,
): Promise<NestFastifyApplication> {
  const module = await Test.createTestingModule({ imports: [AppModule] })
    // SessionGuard → a fixed authenticated user; ProjectAccessGuard is REAL.
    .overrideGuard(SessionGuard)
    .useValue(sessionAs('u1'))
    .overrideProvider(GRAPH_REPOSITORY)
    .useValue(graph)
    .overrideProvider(PROJECT_REPOSITORY)
    .useValue(fakeProjectRepository())
    .overrideProvider(MEMBERSHIP_REPOSITORY)
    .useValue(fakeMembershipRepository({ memberOf: isMember ? [e2eProject.workspaceId] : [] }))
    .compile();
  const app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

describe('Membership authorization is wired through the real ProjectAccessGuard (ADR-0028 §Phase 3)', () => {
  let seeded: SeededGraph;
  let memberApp: NestFastifyApplication;
  let nonMemberApp: NestFastifyApplication;

  beforeAll(async () => {
    seeded = await seedGraphDatabase(graphFixture, E2E_PROJECT_ID);
    memberApp = await buildApp(true, seeded.handle.graphRepository);
    nonMemberApp = await buildApp(false, seeded.handle.graphRepository);
  }, 60_000);

  afterAll(async () => {
    await memberApp?.close();
    await nonMemberApp?.close();
    await seeded?.cleanup();
  });

  const mapUrl = (id: string) => `${graphApiPath(id, GRAPH_SEGMENTS.MAP)}?level=package`;

  describe('graph route /v1/projects/:projectId/graph/*', () => {
    it('member → 200', async () => {
      const res = await memberApp.inject({ method: 'GET', url: mapUrl(E2E_PROJECT_ID) });
      expect(res.statusCode).toBe(200);
    });

    it('non-member → 403', async () => {
      const res = await nonMemberApp.inject({ method: 'GET', url: mapUrl(E2E_PROJECT_ID) });
      expect(res.statusCode).toBe(403);
    });

    it('unknown project → 404 (before any membership check)', async () => {
      const res = await memberApp.inject({ method: 'GET', url: mapUrl(UNKNOWN_PROJECT) });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('ProjectController.get /v1/projects/:projectId', () => {
    it('member → 200', async () => {
      const res = await memberApp.inject({ method: 'GET', url: projectApiPath(E2E_PROJECT_ID) });
      expect(res.statusCode).toBe(200);
      expect(res.json().id).toBe(E2E_PROJECT_ID);
    });

    it('non-member → 403', async () => {
      const res = await nonMemberApp.inject({ method: 'GET', url: projectApiPath(E2E_PROJECT_ID) });
      expect(res.statusCode).toBe(403);
    });

    it('unknown project → 404', async () => {
      const res = await memberApp.inject({ method: 'GET', url: projectApiPath(UNKNOWN_PROJECT) });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('ProjectController.list /v1/projects', () => {
    it('member → only their workspace projects', async () => {
      const res = await memberApp.inject({ method: 'GET', url: projectsApiPath() });
      expect(res.statusCode).toBe(200);
      expect(res.json().items.map((p: { id: string }) => p.id)).toEqual([E2E_PROJECT_ID]);
    });

    it('non-member → empty list (a user in no workspace sees nothing, never 403)', async () => {
      const res = await nonMemberApp.inject({ method: 'GET', url: projectsApiPath() });
      expect(res.statusCode).toBe(200);
      expect(res.json().items).toEqual([]);
    });
  });
});
