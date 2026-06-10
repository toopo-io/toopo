/**
 * ADR-0020 Phase C + ADR-0022 — the project-scoped, gated Serve read API over
 * HTTP. Two booted apps prove the two halves:
 *
 *  - the GATED app keeps the REAL guards and stubs the auth session to null, so a
 *    request to a graph route with no session is rejected 401 — the end-to-end
 *    proof that Fork 5 is closed (the graph is no longer public).
 *  - the SERVING app bypasses the guards and injects a fixed project, so the
 *    V1–V5 endpoints can be exercised against a seeded, project-scoped graph:
 *    response shapes, the trust split on every edge (ADR-0015 §8), bounds/
 *    `truncated`, the 404 for a missing node, and the 400 for a malformed cursor.
 */
import { VersioningType } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  BlastRadiusPageSchema,
  ErrorCode,
  GRAPH_SEGMENTS,
  type GraphSegment,
  graphApiPath,
  MapViewSchema,
  NeighborPageSchema,
  NodeDetailSchema,
  NodePageSchema,
} from '@toopo/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AUTH_INSTANCE } from '../src/modules/auth/auth.module';
import { GRAPH_REPOSITORY } from '../src/modules/database/database.module';
import { ProjectAccessGuard } from '../src/modules/project/project-access.guard';
import { SessionGuard } from '../src/modules/user/session.guard';
import { type SeededGraph, seedGraphDatabase } from './support/graph-backend';
import { graphFixture } from './support/graph-fixture';
import { allowSession, E2E_PROJECT_ID as PROJECT_ID, projectInjector } from './support/serving-app';

async function bootApp(module: TestingModule): Promise<NestFastifyApplication> {
  const app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

describe('Serve read API — gated (Fork 5 closed)', () => {
  let app: NestFastifyApplication;
  let seeded: SeededGraph;

  beforeAll(async () => {
    seeded = await seedGraphDatabase(graphFixture, PROJECT_ID);
    // Real guards; the auth instance reports no session, so the SessionGuard
    // rejects. PROJECT_REPOSITORY is never reached.
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GRAPH_REPOSITORY)
      .useValue(seeded.handle.graphRepository)
      .overrideProvider(AUTH_INSTANCE)
      .useValue({ api: { getSession: () => Promise.resolve(null) } })
      .compile();
    app = await bootApp(module);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await seeded?.cleanup();
  });

  it('401s an unauthenticated request to a graph route', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `${graphApiPath(PROJECT_ID, GRAPH_SEGMENTS.MAP)}?level=package`,
    });
    expect(response.statusCode).toBe(401);
  });
});

describe('Serve read API /v1/projects/:projectId/graph (e2e)', () => {
  let app: NestFastifyApplication;
  let seeded: SeededGraph;

  beforeAll(async () => {
    seeded = await seedGraphDatabase(graphFixture, PROJECT_ID);
    const module: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GRAPH_REPOSITORY)
      .useValue(seeded.handle.graphRepository)
      .overrideGuard(SessionGuard)
      .useValue(allowSession)
      .overrideGuard(ProjectAccessGuard)
      .useValue(projectInjector)
      .compile();
    app = await bootApp(module);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await seeded?.cleanup();
  });

  const get = (segment: GraphSegment, qs = '') =>
    app.inject({ method: 'GET', url: `${graphApiPath(PROJECT_ID, segment)}${qs}` });

  it('V1 map: aggregates packages with trust-split edges', async () => {
    const response = await get(GRAPH_SEGMENTS.MAP, '?level=package');
    expect(response.statusCode).toBe(200);
    const view = MapViewSchema.parse(response.json());
    const counts = new Map(view.nodes.map((n) => [n.node.id, n.childCount]));
    expect(counts.get('pkgA')).toBe(4);
    expect(counts.get('pkgB')).toBe(1);
    expect(view.edges).toContainEqual({
      sourceId: 'pkgA',
      targetId: 'pkgB',
      deterministic: 1,
      inferred: 1,
    });
  });

  it('V1 map: symbol level within a file scope', async () => {
    const response = await get(GRAPH_SEGMENTS.MAP, '?level=symbol&scope=fileA1');
    expect(response.statusCode).toBe(200);
    const view = MapViewSchema.parse(response.json());
    expect(view.nodes.map((n) => n.node.id).sort()).toEqual(['propP1', 'propP2', 'sA']);
  });

  it('V1 map: rejects an unscoped symbol level with 400', async () => {
    const response = await get(GRAPH_SEGMENTS.MAP, '?level=symbol');
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe(ErrorCode.VALIDATION_FAILED);
  });

  it('V2 node detail: composes interface, neighbours and call-sites', async () => {
    const response = await get(GRAPH_SEGMENTS.NODE, '?id=sA');
    expect(response.statusCode).toBe(200);
    const detail = NodeDetailSchema.parse(response.json());
    expect(detail.node.id).toBe('sA');
    expect(detail.declaredInterface.items.map((n) => n.id)).toEqual(['propP1', 'propP2']);
    expect(detail.callSites.items.map((n) => n.id)).toEqual(['cs1']);
    expect(detail.outgoing.items.map((n) => `${n.edge.kind}:${n.edge.targetId}`)).toEqual(
      expect.arrayContaining(['calls:sA2', 'references:sB']),
    );
  });

  it('V2 node detail: 404 for a missing node', async () => {
    const response = await get(GRAPH_SEGMENTS.NODE, '?id=does-not-exist');
    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe(ErrorCode.NOT_FOUND);
  });

  it('V3 neighbours: surfaces resolution/confidence on every edge', async () => {
    const response = await get(GRAPH_SEGMENTS.NEIGHBORS, '?id=sA&direction=out');
    expect(response.statusCode).toBe(200);
    const page = NeighborPageSchema.parse(response.json());
    const ref = page.items.find((n) => n.edge.targetId === 'sB');
    expect(ref?.edge).toMatchObject({ resolution: 'inferred', confidence: 'medium' });
    const call = page.items.find((n) => n.edge.targetId === 'sA2');
    expect(call?.edge.resolution).toBe('deterministic');
  });

  it('V4 blast radius: bounded with an honest truncated flag', async () => {
    const full = await get(GRAPH_SEGMENTS.BLAST_RADIUS, '?id=sB');
    const fullPage = BlastRadiusPageSchema.parse(full.json());
    expect(fullPage.items.map((h) => h.nodeId).sort()).toEqual(['sA', 'sA2']);
    expect(fullPage.truncated).toBe(false);
    const trust = new Map(fullPage.items.map((h) => [h.nodeId, h.pathResolution]));
    expect(trust.get('sA2')).toBe('deterministic');

    const capped = await get(GRAPH_SEGMENTS.BLAST_RADIUS, '?id=sB&maxDepth=1');
    expect(BlastRadiusPageSchema.parse(capped.json()).truncated).toBe(true);
  });

  it('zoom-in: declared interface and call-sites', async () => {
    const di = await get(GRAPH_SEGMENTS.DECLARED_INTERFACE, '?id=sA');
    expect(NodePageSchema.parse(di.json()).items.map((n) => n.id)).toEqual(['propP1', 'propP2']);

    const cs = await get(GRAPH_SEGMENTS.CALL_SITES, '?id=sA');
    expect(NodePageSchema.parse(cs.json()).items.map((n) => n.id)).toEqual(['cs1']);
  });

  it('V5 search: by name substring and by kind', async () => {
    const byName = await get(GRAPH_SEGMENTS.SEARCH, '?query=button');
    expect(NodePageSchema.parse(byName.json()).items.map((n) => n.id)).toEqual(['sB']);

    const byKind = await get(GRAPH_SEGMENTS.SEARCH, '?kind=package');
    expect(
      NodePageSchema.parse(byKind.json())
        .items.map((n) => n.id)
        .sort(),
    ).toEqual(['pkgA', 'pkgB']);
  });

  it('paginates and rejects a malformed cursor with 400', async () => {
    const page = await get(GRAPH_SEGMENTS.SEARCH, '?subKind=react:prop&limit=1');
    const first = NodePageSchema.parse(page.json());
    expect(first.items.map((n) => n.id)).toEqual(['propP1']);
    expect(first.nextCursor).not.toBeNull();

    const bad = await get(GRAPH_SEGMENTS.SEARCH, '?cursor=not-a-real-cursor');
    expect(bad.statusCode).toBe(400);
    expect(bad.json().code).toBe(ErrorCode.VALIDATION_FAILED);
  });
});
