/**
 * ADR-0020 Phase B — the Serve composition. Unit-tested against a fake
 * GraphRepository (the SQL is exercised in @toopo/db's dual-backend suite), so
 * these tests pin the composition logic: node-detail assembly, the null→404
 * signal, contract-shape adaptation, and faithful option pass-through.
 */
import type { Edge, GraphDocument, Node, SymbolId } from '@toopo/core';
import type {
  BlastRadiusOptions,
  BlastRadiusPage,
  BlastRadiusPageOptions,
  EdgeKind,
  GraphRepository,
  MapView,
  MapViewOptions,
  Neighbor,
  NeighborDirection,
  NeighborPageOptions,
  Page,
  PageOptions,
  PersistGraphResult,
  SearchOptions,
} from '@toopo/db';
import { describe, expect, it, vi } from 'vitest';
import { GraphViewService } from './graph-view.service.js';

const nodeA: Node = { kind: 'symbol', id: 'sA', name: 'Widget', properties: {} };
const propP1: Node = {
  kind: 'symbol',
  id: 'propP1',
  name: 'label',
  subKind: 'react:prop',
  properties: {},
};
const callSite: Node = {
  kind: 'callSite',
  id: 'cs1',
  enclosingSymbolId: 'sA',
  callee: 'helper',
  ordinal: 0,
  payload: [],
  properties: {},
};
const inEdge: Edge = {
  kind: 'calls',
  sourceId: 'caller',
  targetId: 'sA',
  resolution: 'deterministic',
  provenance: { pass: 'resolve', rule: 'r' },
};

function nodePage(items: readonly Node[], nextCursor: string | null = null): Page<Node> {
  return { items, nextCursor };
}

/** A GraphRepository fake: read methods return canned data, writers are unused. */
function fakeRepository(overrides: Partial<GraphRepository>): GraphRepository {
  const base: GraphRepository = {
    persistGraph(_document: GraphDocument): Promise<PersistGraphResult> {
      throw new Error('unused');
    },
    getNode(_id: SymbolId): Promise<Node | null> {
      return Promise.resolve(null);
    },
    neighbors(_id: SymbolId, _direction: NeighborDirection, _kind?: EdgeKind) {
      throw new Error('unused');
    },
    blastRadius(_id: SymbolId, _options?: BlastRadiusOptions) {
      throw new Error('unused');
    },
    neighborsPage(_id: SymbolId, _direction: NeighborDirection, _options?: NeighborPageOptions) {
      return Promise.resolve<Page<Neighbor>>({ items: [], nextCursor: null });
    },
    search(_options?: SearchOptions) {
      return Promise.resolve(nodePage([]));
    },
    declaredInterface(_id: SymbolId, _options?: PageOptions) {
      return Promise.resolve(nodePage([]));
    },
    callSitesOf(_id: SymbolId, _options?: PageOptions) {
      return Promise.resolve(nodePage([]));
    },
    blastRadiusPage(_id: SymbolId, _options?: BlastRadiusPageOptions): Promise<BlastRadiusPage> {
      return Promise.resolve({ items: [], nextCursor: null, truncated: false });
    },
    mapView(_options: MapViewOptions): Promise<MapView> {
      return Promise.resolve({ level: 'package', nodes: [], edges: [], truncated: false });
    },
  };
  return { ...base, ...overrides };
}

describe('GraphViewService.nodeDetail', () => {
  it('returns null when the node is absent (host maps to 404)', async () => {
    const service = new GraphViewService(fakeRepository({ getNode: () => Promise.resolve(null) }));
    expect(await service.nodeDetail({ id: 'missing' })).toBeNull();
  });

  it('composes node + declared interface + neighbours + call-sites', async () => {
    const service = new GraphViewService(
      fakeRepository({
        getNode: () => Promise.resolve(nodeA),
        declaredInterface: () => Promise.resolve(nodePage([propP1])),
        neighborsPage: (_id, direction) =>
          Promise.resolve<Page<Neighbor>>({
            items: direction === 'in' ? [{ edge: inEdge, node: null }] : [],
            nextCursor: null,
          }),
        callSitesOf: () => Promise.resolve(nodePage([callSite])),
      }),
    );

    const detail = await service.nodeDetail({ id: 'sA' });

    expect(detail?.node.id).toBe('sA');
    expect(detail?.declaredInterface.items.map((n) => n.id)).toEqual(['propP1']);
    expect(detail?.incoming.items[0]?.edge.kind).toBe('calls');
    expect(detail?.incoming.items[0]?.node).toBeNull();
    expect(detail?.outgoing.items).toEqual([]);
    expect(detail?.callSites.items.map((n) => n.id)).toEqual(['cs1']);
  });
});

describe('GraphViewService pass-through', () => {
  it('forwards neighbours options and adapts the page shape', async () => {
    const neighborsPage = vi.fn((_id, _direction, _options) =>
      Promise.resolve<Page<Neighbor>>({ items: [{ edge: inEdge, node: nodeA }], nextCursor: 'c' }),
    );
    const service = new GraphViewService(fakeRepository({ neighborsPage }));

    const page = await service.neighbors({ id: 'sA', direction: 'in', kind: 'calls', limit: 10 });

    expect(neighborsPage).toHaveBeenCalledWith('sA', 'in', {
      kind: 'calls',
      limit: 10,
      cursor: undefined,
    });
    expect(page).toEqual({ items: [{ edge: inEdge, node: nodeA }], nextCursor: 'c' });
  });

  it('forwards blast-radius options, preserving the truncated flag and per-hit trust', async () => {
    const service = new GraphViewService(
      fakeRepository({
        blastRadiusPage: () =>
          Promise.resolve({
            items: [
              { nodeId: 'proven', depth: 1, pathResolution: 'deterministic', node: nodeA },
              { nodeId: 'guessed', depth: 2, pathResolution: 'inferred', node: null },
            ],
            nextCursor: null,
            truncated: true,
          }),
      }),
    );

    const page = await service.blastRadius({ id: 'sA', maxDepth: 1 });

    expect(page.truncated).toBe(true);
    expect(page.items.map((h) => h.nodeId)).toEqual(['proven', 'guessed']);
    // pathResolution survives composition unchanged (ADR-0021).
    expect(page.items.map((h) => h.pathResolution)).toEqual(['deterministic', 'inferred']);
  });

  it('maps a map view, copying its node and edge arrays', async () => {
    const view: MapView = {
      level: 'package',
      nodes: [{ node: nodeA, childCount: 2 }],
      edges: [{ sourceId: 'pkgA', targetId: 'pkgB', deterministic: 1, inferred: 0 }],
      truncated: true,
    };
    const service = new GraphViewService(fakeRepository({ mapView: () => Promise.resolve(view) }));

    const result = await service.map({ level: 'package' });

    expect(result).toEqual(view);
    expect(result.nodes).not.toBe(view.nodes);
  });

  it('forwards search filters', async () => {
    const search = vi.fn((_options?: SearchOptions) => Promise.resolve(nodePage([nodeA])));
    const service = new GraphViewService(fakeRepository({ search }));

    const page = await service.search({ query: 'wid', kind: 'symbol' });

    expect(search).toHaveBeenCalledWith({
      query: 'wid',
      kind: 'symbol',
      subKind: undefined,
      limit: undefined,
      cursor: undefined,
    });
    expect(page.items.map((n) => n.id)).toEqual(['sA']);
  });

  it('forwards declared-interface and call-site paging options', async () => {
    const declaredInterface = vi.fn((_id: SymbolId, _options?: PageOptions) =>
      Promise.resolve(nodePage([propP1])),
    );
    const callSitesOf = vi.fn((_id: SymbolId, _options?: PageOptions) =>
      Promise.resolve(nodePage([callSite])),
    );
    const service = new GraphViewService(fakeRepository({ declaredInterface, callSitesOf }));

    await service.declaredInterface({ id: 'sA', limit: 5, cursor: 'c' });
    await service.callSites({ id: 'sA' });

    expect(declaredInterface).toHaveBeenCalledWith('sA', { limit: 5, cursor: 'c' });
    expect(callSitesOf).toHaveBeenCalledWith('sA', { limit: undefined, cursor: undefined });
  });
});
