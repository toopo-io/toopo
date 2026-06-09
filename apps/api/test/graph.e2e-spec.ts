/**
 * ADR-0020 Phase C — the Serve read API over HTTP. Boots the real Nest app with
 * a seeded fixture graph (GRAPH_REPOSITORY overridden), then exercises V1–V5 and
 * the zoom-in endpoints end to end: response shapes (validated against the
 * contract schemas), the trust split surfaced on every edge (ADR-0015 §8),
 * bounds/`truncated`, the 404 for a missing node, and the 400 for a malformed
 * cursor and an unscoped symbol map.
 */
import { VersioningType } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  BlastRadiusPageSchema,
  ErrorCode,
  GRAPH_SEGMENTS,
  graphApiPath,
  MapViewSchema,
  NeighborPageSchema,
  NodeDetailSchema,
  NodePageSchema,
} from '@toopo/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { GRAPH_REPOSITORY } from '../src/modules/database/database.module';
import { type SeededGraph, seedGraphDatabase } from './support/graph-backend';
import { graphFixture } from './support/graph-fixture';

describe('Serve read API /v1/graph (e2e)', () => {
  let app: NestFastifyApplication;
  let seeded: SeededGraph;

  beforeAll(async () => {
    seeded = await seedGraphDatabase(graphFixture);
    const module: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GRAPH_REPOSITORY)
      .useValue(seeded.handle.graphRepository)
      .compile();

    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await seeded?.cleanup();
  });

  const get = (path: string) => app.inject({ method: 'GET', url: path });

  it('V1 map: aggregates packages with trust-split edges', async () => {
    const response = await get(`${graphApiPath(GRAPH_SEGMENTS.MAP)}?level=package`);
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
    const response = await get(`${graphApiPath(GRAPH_SEGMENTS.MAP)}?level=symbol&scope=fileA1`);
    expect(response.statusCode).toBe(200);
    const view = MapViewSchema.parse(response.json());
    expect(view.nodes.map((n) => n.node.id).sort()).toEqual(['propP1', 'propP2', 'sA']);
  });

  it('V1 map: rejects an unscoped symbol level with 400', async () => {
    const response = await get(`${graphApiPath(GRAPH_SEGMENTS.MAP)}?level=symbol`);
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe(ErrorCode.VALIDATION_FAILED);
  });

  it('V2 node detail: composes interface, neighbours and call-sites', async () => {
    const response = await get(`${graphApiPath(GRAPH_SEGMENTS.NODE)}?id=sA`);
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
    const response = await get(`${graphApiPath(GRAPH_SEGMENTS.NODE)}?id=does-not-exist`);
    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe(ErrorCode.NOT_FOUND);
  });

  it('V3 neighbours: surfaces resolution/confidence on every edge', async () => {
    const response = await get(`${graphApiPath(GRAPH_SEGMENTS.NEIGHBORS)}?id=sA&direction=out`);
    expect(response.statusCode).toBe(200);
    const page = NeighborPageSchema.parse(response.json());
    const ref = page.items.find((n) => n.edge.targetId === 'sB');
    expect(ref?.edge).toMatchObject({ resolution: 'inferred', confidence: 'medium' });
    const call = page.items.find((n) => n.edge.targetId === 'sA2');
    expect(call?.edge.resolution).toBe('deterministic');
  });

  it('V4 blast radius: bounded with an honest truncated flag', async () => {
    const full = await get(`${graphApiPath(GRAPH_SEGMENTS.BLAST_RADIUS)}?id=sB`);
    const fullPage = BlastRadiusPageSchema.parse(full.json());
    expect(fullPage.items.map((h) => h.nodeId).sort()).toEqual(['sA', 'sA2']);
    expect(fullPage.truncated).toBe(false);

    const capped = await get(`${graphApiPath(GRAPH_SEGMENTS.BLAST_RADIUS)}?id=sB&maxDepth=1`);
    expect(BlastRadiusPageSchema.parse(capped.json()).truncated).toBe(true);
  });

  it('zoom-in: declared interface and call-sites', async () => {
    const di = await get(`${graphApiPath(GRAPH_SEGMENTS.DECLARED_INTERFACE)}?id=sA`);
    expect(NodePageSchema.parse(di.json()).items.map((n) => n.id)).toEqual(['propP1', 'propP2']);

    const cs = await get(`${graphApiPath(GRAPH_SEGMENTS.CALL_SITES)}?id=sA`);
    expect(NodePageSchema.parse(cs.json()).items.map((n) => n.id)).toEqual(['cs1']);
  });

  it('V5 search: by name substring and by kind', async () => {
    const byName = await get(`${graphApiPath(GRAPH_SEGMENTS.SEARCH)}?query=button`);
    expect(NodePageSchema.parse(byName.json()).items.map((n) => n.id)).toEqual(['sB']);

    const byKind = await get(`${graphApiPath(GRAPH_SEGMENTS.SEARCH)}?kind=package`);
    expect(
      NodePageSchema.parse(byKind.json())
        .items.map((n) => n.id)
        .sort(),
    ).toEqual(['pkgA', 'pkgB']);
  });

  it('paginates and rejects a malformed cursor with 400', async () => {
    const page = await get(`${graphApiPath(GRAPH_SEGMENTS.SEARCH)}?subKind=react:prop&limit=1`);
    const first = NodePageSchema.parse(page.json());
    expect(first.items.map((n) => n.id)).toEqual(['propP1']);
    expect(first.nextCursor).not.toBeNull();

    const bad = await get(`${graphApiPath(GRAPH_SEGMENTS.SEARCH)}?cursor=not-a-real-cursor`);
    expect(bad.statusCode).toBe(400);
    expect(bad.json().code).toBe(ErrorCode.VALIDATION_FAILED);
  });
});
