/**
 * ADR-0020 Phase D — the dogfood: ingest one of Toopo's own real packages
 * (@toopo/core) into a graph, persist it, and serve it over the LIVE V1–V5
 * endpoints — the deliverable. This exercises the whole Serve pass end to end on
 * real code: the aggregate map, composed node detail, paginated neighbours with
 * trust surfaced, bounded blast radius, and search — asserting shapes, the
 * deterministic/inferred split, and that bounds hold (nothing unbounded).
 *
 * SQLite is sufficient here; cross-backend identity is proven in @toopo/db's
 * dual-backend dogfood. Ingest runs once in beforeAll (a few seconds).
 */
import { resolve } from 'node:path';
import { VersioningType } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  BlastRadiusPageSchema,
  GRAPH_SEGMENTS,
  type GraphSegment,
  graphApiPath,
  MapViewSchema,
  NeighborPageSchema,
  NodeDetailSchema,
  NodePageSchema,
} from '@toopo/api-contracts';
import type { GraphDocument } from '@toopo/core';
import { buildTypescriptProjectModel, ingestProject } from '@toopo/ingest';
import { createReactPlugins, createReactResolver } from '@toopo/lang-react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { GRAPH_REPOSITORY } from '../src/modules/database/database.module';
import { type SeededGraph, seedGraphDatabase } from './support/graph-backend';

/** Ingest a real TS/React package directory into a deterministic graph document. */
async function ingestPackage(rootDir: string): Promise<GraphDocument> {
  const result = await ingestProject(rootDir, {
    languagePlugins: createReactPlugins(),
    resolverPlugins: [createReactResolver()],
    buildProjectModel: (discovered) => buildTypescriptProjectModel(rootDir, discovered),
  });
  return result.document;
}

describe('Serve dogfood: @toopo/core over live V1–V5 (e2e)', () => {
  let app: NestFastifyApplication;
  let seeded: SeededGraph;
  let document: GraphDocument;
  /** A real, depended-on symbol id discovered from the served graph. */
  let hotSymbolId: string;

  beforeAll(async () => {
    const corePackageDir = resolve(process.cwd(), '..', '..', 'packages', 'core');
    document = await ingestPackage(corePackageDir);
    seeded = await seedGraphDatabase(document);

    const module: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GRAPH_REPOSITORY)
      .useValue(seeded.handle.graphRepository)
      .compile();

    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await seeded?.cleanup();
  });

  const get = (path: string) => app.inject({ method: 'GET', url: path });
  const q = (segment: GraphSegment, params: string) => `${graphApiPath(segment)}?${params}`;

  it('V5 search finds a known core symbol on the real graph', async () => {
    const response = await get(q(GRAPH_SEGMENTS.SEARCH, 'query=AnalysisSchema'));
    expect(response.statusCode).toBe(200);
    const page = NodePageSchema.parse(response.json());
    const symbol = page.items.find((n) => n.kind === 'symbol' && n.name === 'AnalysisSchema');
    expect(symbol).toBeDefined();
    hotSymbolId = symbol?.id ?? '';
    expect(hotSymbolId.length).toBeGreaterThan(0);
  });

  it('V2 node detail composes the real symbol', async () => {
    const response = await get(q(GRAPH_SEGMENTS.NODE, `id=${encodeURIComponent(hotSymbolId)}`));
    expect(response.statusCode).toBe(200);
    const detail = NodeDetailSchema.parse(response.json());
    expect(detail.node.id).toBe(hotSymbolId);
  });

  it('V3 neighbours surface the trust split on real edges', async () => {
    const response = await get(
      q(GRAPH_SEGMENTS.NEIGHBORS, `id=${encodeURIComponent(hotSymbolId)}&direction=in`),
    );
    expect(response.statusCode).toBe(200);
    const page = NeighborPageSchema.parse(response.json());
    expect(page.items.length).toBeGreaterThan(0);
    // Every edge carries a resolution; deterministic edges never carry confidence.
    for (const neighbor of page.items) {
      expect(['deterministic', 'inferred']).toContain(neighbor.edge.resolution);
      if (neighbor.edge.resolution === 'deterministic') {
        expect('confidence' in neighbor.edge).toBe(false);
      }
    }
  });

  it('V4 blast radius returns real dependents, bounded', async () => {
    const response = await get(
      q(GRAPH_SEGMENTS.BLAST_RADIUS, `id=${encodeURIComponent(hotSymbolId)}`),
    );
    expect(response.statusCode).toBe(200);
    const page = BlastRadiusPageSchema.parse(response.json());
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.every((hit) => hit.depth >= 1)).toBe(true);
  });

  it('V1 map at file level is scoped and bounded (truncated flag honest)', async () => {
    const response = await get(q(GRAPH_SEGMENTS.MAP, 'level=file&limit=3'));
    expect(response.statusCode).toBe(200);
    const view = MapViewSchema.parse(response.json());
    expect(view.nodes.length).toBeLessThanOrEqual(3);
    // @toopo/core has more than three files, so the cap must report truncation.
    expect(view.truncated).toBe(true);
  });

  it('V5 search is keyset-paginated, never unbounded', async () => {
    const response = await get(q(GRAPH_SEGMENTS.SEARCH, 'kind=symbol&limit=5'));
    const page = NodePageSchema.parse(response.json());
    expect(page.items.length).toBe(5);
    expect(page.nextCursor).not.toBeNull();
  });

  it('reports the dogfood over the live API', () => {
    const lines = [
      '',
      '=== ADR-0020 Serve dogfood — @toopo/core over live V1–V5 ===',
      `graph: ${document.nodes.length} nodes, ${document.edges.length} edges`,
      `hot symbol served: ${hotSymbolId}`,
    ];
    process.stdout.write(`${lines.join('\n')}\n`);
    expect(document.nodes.length).toBeGreaterThan(0);
  });
});
