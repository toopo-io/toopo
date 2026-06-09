/**
 * ADR-0020 Phase B — the Serve API contract schemas. Verifies query-param
 * coercion and strictness, the keyset-pagination envelope, and that response
 * schemas accept real core Node/Edge shapes with trust carried on every edge.
 */
import type { Edge, Node } from '@toopo/core';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { GRAPH_SEGMENTS, graphApiPath } from '../graph-routes.js';
import {
  BlastRadiusPageSchema,
  BlastRadiusQuerySchema,
  GraphNeighborSchema,
  MapQuerySchema,
  MapViewSchema,
  NeighborPageSchema,
  NodeDetailSchema,
  paginated,
  SearchQuerySchema,
} from './graph.schema.js';

const symbolNode: Node = { kind: 'symbol', id: 'sA', name: 'Widget', properties: {} };
const fileNode: Node = {
  kind: 'file',
  id: 'fileA',
  path: 'a.ts',
  contentHash: 'h',
  analysis: { status: 'analyzed' },
  properties: {},
};
const deterministicEdge: Edge = {
  kind: 'calls',
  sourceId: 'sA',
  targetId: 'sB',
  resolution: 'deterministic',
  provenance: { pass: 'resolve', rule: 'r' },
};
const inferredEdge: Edge = {
  kind: 'references',
  sourceId: 'sA',
  targetId: 'sB',
  resolution: 'inferred',
  confidence: 'medium',
  provenance: { pass: 'resolve', rule: 'r' },
};

describe('query schemas', () => {
  it('coerces numeric limit and rejects unknown params', () => {
    const parsed = MapQuerySchema.parse({ level: 'file', scope: 'pkgA', limit: '25' });
    expect(parsed.limit).toBe(25);
    expect(() => MapQuerySchema.parse({ level: 'file', bogus: 'x' })).toThrow();
  });

  it('rejects an invalid map level', () => {
    expect(() => MapQuerySchema.parse({ level: 'module' })).toThrow();
  });

  it('requires a scope for the symbol level (never unbounded), and accepts it with one', () => {
    // The symbol level must be scoped to a file — otherwise it could return
    // every symbol in the repo (ADR-0020 Fork 4).
    expect(() => MapQuerySchema.parse({ level: 'symbol' })).toThrow();
    expect(MapQuerySchema.parse({ level: 'symbol', scope: 'fileA' })).toEqual({
      level: 'symbol',
      scope: 'fileA',
    });
  });

  it('allows the package and file levels without a scope', () => {
    expect(MapQuerySchema.parse({ level: 'package' }).scope).toBeUndefined();
    expect(MapQuerySchema.parse({ level: 'file' }).scope).toBeUndefined();
  });

  it('coerces blast-radius maxDepth', () => {
    expect(BlastRadiusQuerySchema.parse({ id: 'sA', maxDepth: '3' }).maxDepth).toBe(3);
  });

  it('accepts an empty search (browse all) and a kind filter', () => {
    expect(SearchQuerySchema.parse({}).query).toBeUndefined();
    expect(SearchQuerySchema.parse({ kind: 'package' }).kind).toBe('package');
    expect(() => SearchQuerySchema.parse({ kind: 'module' })).toThrow();
  });
});

describe('pagination envelope', () => {
  it('wraps items with a nullable cursor and optional total', () => {
    const schema = paginated(z.string());
    expect(schema.parse({ items: ['a'], nextCursor: null })).toEqual({
      items: ['a'],
      nextCursor: null,
    });
    expect(schema.parse({ items: [], nextCursor: 'c', total: 5 }).total).toBe(5);
  });
});

describe('graphApiPath', () => {
  it('builds the versioned /v1/graph/<segment> client paths', () => {
    expect(graphApiPath(GRAPH_SEGMENTS.MAP)).toBe('/v1/graph/map');
    expect(graphApiPath(GRAPH_SEGMENTS.NODE)).toBe('/v1/graph/node');
    expect(graphApiPath(GRAPH_SEGMENTS.NEIGHBORS)).toBe('/v1/graph/neighbors');
    expect(graphApiPath(GRAPH_SEGMENTS.BLAST_RADIUS)).toBe('/v1/graph/blast-radius');
    expect(graphApiPath(GRAPH_SEGMENTS.DECLARED_INTERFACE)).toBe('/v1/graph/declared-interface');
    expect(graphApiPath(GRAPH_SEGMENTS.CALL_SITES)).toBe('/v1/graph/call-sites');
    expect(graphApiPath(GRAPH_SEGMENTS.SEARCH)).toBe('/v1/graph/search');
  });
});

describe('response schemas', () => {
  it('carries trust on every neighbour edge', () => {
    const page = NeighborPageSchema.parse({
      items: [
        { edge: deterministicEdge, node: symbolNode },
        { edge: inferredEdge, node: null },
      ],
      nextCursor: null,
    });
    expect(page.items[0]?.edge.resolution).toBe('deterministic');
    expect(page.items[1]?.edge).toMatchObject({ resolution: 'inferred', confidence: 'medium' });
  });

  it('accepts a null far-end node (external identity)', () => {
    expect(GraphNeighborSchema.parse({ edge: deterministicEdge, node: null }).node).toBeNull();
  });

  it('validates a map view with trust-split edges', () => {
    const view = MapViewSchema.parse({
      level: 'package',
      nodes: [{ node: fileNode, childCount: 3 }],
      edges: [{ sourceId: 'pkgA', targetId: 'pkgB', deterministic: 1, inferred: 2 }],
      truncated: false,
    });
    expect(view.edges[0]).toEqual({
      sourceId: 'pkgA',
      targetId: 'pkgB',
      deterministic: 1,
      inferred: 2,
    });
  });

  it('carries per-hit pathResolution on the blast radius and rejects an invalid one', () => {
    const page = BlastRadiusPageSchema.parse({
      items: [
        { nodeId: 'sA2', depth: 1, pathResolution: 'deterministic', node: symbolNode },
        { nodeId: 'sA', depth: 2, pathResolution: 'inferred', node: null },
      ],
      nextCursor: null,
      truncated: false,
    });
    expect(page.items.map((h) => h.pathResolution)).toEqual(['deterministic', 'inferred']);
    expect(() =>
      BlastRadiusPageSchema.parse({
        items: [{ nodeId: 'sA', depth: 1, pathResolution: 'maybe', node: null }],
        nextCursor: null,
        truncated: false,
      }),
    ).toThrow();
  });

  it('validates a composed node detail', () => {
    const emptyNodePage = { items: [], nextCursor: null };
    const detail = NodeDetailSchema.parse({
      node: symbolNode,
      declaredInterface: emptyNodePage,
      incoming: { items: [{ edge: inferredEdge, node: symbolNode }], nextCursor: null },
      outgoing: emptyNodePage,
      callSites: emptyNodePage,
    });
    expect(detail.node.id).toBe('sA');
    expect(detail.incoming.items).toHaveLength(1);
  });
});
