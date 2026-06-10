/**
 * ADR-0020 Phase B — the Serve composition. Unit-tested against a fake
 * GraphRepository (the SQL is exercised in @toopo/db's dual-backend suite), so
 * these tests pin the composition logic: node-detail assembly, the null→404
 * signal, contract-shape adaptation, faithful option pass-through, and that the
 * project scope (ADR-0022) is threaded to every repository read.
 */
import type { Edge, GraphDocument, Node, SymbolId, UnresolvedReference } from '@toopo/core';
import type {
  BlastRadiusOptions,
  BlastRadiusPage,
  BlastRadiusPageOptions,
  EdgeKind,
  GraphRepository,
  GraphScope,
  MapView,
  MapViewOptions,
  Neighbor,
  NeighborDirection,
  NeighborPageOptions,
  Page,
  PageOptions,
  PersistGraphResult,
  SearchOptions,
  UnresolvedReferenceOptions,
} from '@toopo/db';
import { describe, expect, it, vi } from 'vitest';
import { GraphViewService } from './graph-view.service.js';

const SCOPE: GraphScope = { projectId: 'p-serve' };

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
    persistGraph(_scope: GraphScope, _document: GraphDocument): Promise<PersistGraphResult> {
      throw new Error('unused');
    },
    getNode(_scope: GraphScope, _id: SymbolId): Promise<Node | null> {
      return Promise.resolve(null);
    },
    neighbors(_scope: GraphScope, _id: SymbolId, _direction: NeighborDirection, _kind?: EdgeKind) {
      throw new Error('unused');
    },
    blastRadius(_scope: GraphScope, _id: SymbolId, _options?: BlastRadiusOptions) {
      throw new Error('unused');
    },
    neighborsPage(
      _scope: GraphScope,
      _id: SymbolId,
      _direction: NeighborDirection,
      _options?: NeighborPageOptions,
    ) {
      return Promise.resolve<Page<Neighbor>>({ items: [], nextCursor: null });
    },
    search(_scope: GraphScope, _options?: SearchOptions) {
      return Promise.resolve(nodePage([]));
    },
    declaredInterface(_scope: GraphScope, _id: SymbolId, _options?: PageOptions) {
      return Promise.resolve(nodePage([]));
    },
    containedDeclarations(_scope: GraphScope, _id: SymbolId, _options?: PageOptions) {
      return Promise.resolve(nodePage([]));
    },
    callSitesOf(_scope: GraphScope, _id: SymbolId, _options?: PageOptions) {
      return Promise.resolve(nodePage([]));
    },
    blastRadiusPage(
      _scope: GraphScope,
      _id: SymbolId,
      _options?: BlastRadiusPageOptions,
    ): Promise<BlastRadiusPage> {
      return Promise.resolve({ items: [], nextCursor: null, truncated: false });
    },
    mapView(_scope: GraphScope, _options: MapViewOptions): Promise<MapView> {
      return Promise.resolve({ level: 'package', nodes: [], edges: [], truncated: false });
    },
    unresolvedReferences(_scope: GraphScope, _options?: UnresolvedReferenceOptions) {
      return Promise.resolve<Page<UnresolvedReference>>({ items: [], nextCursor: null });
    },
  };
  return { ...base, ...overrides };
}

describe('GraphViewService.nodeDetail', () => {
  it('returns null when the node is absent (host maps to 404)', async () => {
    const service = new GraphViewService(fakeRepository({ getNode: () => Promise.resolve(null) }));
    expect(await service.nodeDetail(SCOPE, { id: 'missing' })).toBeNull();
  });

  it('threads the scope and composes node + interface + neighbours + call-sites', async () => {
    const getNode = vi.fn((_scope: GraphScope, _id: SymbolId) => Promise.resolve(nodeA));
    const service = new GraphViewService(
      fakeRepository({
        getNode,
        declaredInterface: () => Promise.resolve(nodePage([propP1])),
        neighborsPage: (_scope, _id, direction) =>
          Promise.resolve<Page<Neighbor>>({
            items: direction === 'in' ? [{ edge: inEdge, node: null }] : [],
            nextCursor: null,
          }),
        callSitesOf: () => Promise.resolve(nodePage([callSite])),
      }),
    );

    const detail = await service.nodeDetail(SCOPE, { id: 'sA' });

    expect(getNode).toHaveBeenCalledWith(SCOPE, 'sA');
    expect(detail?.node.id).toBe('sA');
    expect(detail?.declaredInterface.items.map((n) => n.id)).toEqual(['propP1']);
    expect(detail?.incoming.items[0]?.edge.kind).toBe('calls');
    expect(detail?.incoming.items[0]?.node).toBeNull();
    expect(detail?.outgoing.items).toEqual([]);
    expect(detail?.callSites.items.map((n) => n.id)).toEqual(['cs1']);
  });
});

describe('GraphViewService pass-through', () => {
  it('forwards the scope and neighbours options, adapting the page shape', async () => {
    const neighborsPage = vi.fn((_scope, _id, _direction, _options) =>
      Promise.resolve<Page<Neighbor>>({ items: [{ edge: inEdge, node: nodeA }], nextCursor: 'c' }),
    );
    const service = new GraphViewService(fakeRepository({ neighborsPage }));

    const page = await service.neighbors(SCOPE, {
      id: 'sA',
      direction: 'in',
      kind: 'calls',
      limit: 10,
    });

    expect(neighborsPage).toHaveBeenCalledWith(SCOPE, 'sA', 'in', {
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

    const page = await service.blastRadius(SCOPE, { id: 'sA', maxDepth: 1 });

    expect(page.truncated).toBe(true);
    expect(page.items.map((h) => h.nodeId)).toEqual(['proven', 'guessed']);
    // pathResolution survives composition unchanged (ADR-0021).
    expect(page.items.map((h) => h.pathResolution)).toEqual(['deterministic', 'inferred']);
  });

  it('threads the scope to a map view, copying its node and edge arrays', async () => {
    const view: MapView = {
      level: 'package',
      nodes: [{ node: nodeA, childCount: 2 }],
      edges: [{ sourceId: 'pkgA', targetId: 'pkgB', deterministic: 1, inferred: 0 }],
      truncated: true,
    };
    const mapView = vi.fn((_scope: GraphScope, _options: MapViewOptions) => Promise.resolve(view));
    const service = new GraphViewService(fakeRepository({ mapView }));

    const result = await service.map(SCOPE, { level: 'package' });

    expect(mapView).toHaveBeenCalledWith(SCOPE, {
      level: 'package',
      scope: undefined,
      limit: undefined,
    });
    expect(result).toEqual(view);
    expect(result.nodes).not.toBe(view.nodes);
  });

  it('forwards search filters with the scope', async () => {
    const search = vi.fn((_scope: GraphScope, _options?: SearchOptions) =>
      Promise.resolve(nodePage([nodeA])),
    );
    const service = new GraphViewService(fakeRepository({ search }));

    const page = await service.search(SCOPE, { query: 'wid', kind: 'symbol' });

    expect(search).toHaveBeenCalledWith(SCOPE, {
      query: 'wid',
      kind: 'symbol',
      subKind: undefined,
      limit: undefined,
      cursor: undefined,
    });
    expect(page.items.map((n) => n.id)).toEqual(['sA']);
  });

  it('forwards declared-interface and call-site paging options with the scope', async () => {
    const declaredInterface = vi.fn((_scope: GraphScope, _id: SymbolId, _options?: PageOptions) =>
      Promise.resolve(nodePage([propP1])),
    );
    const callSitesOf = vi.fn((_scope: GraphScope, _id: SymbolId, _options?: PageOptions) =>
      Promise.resolve(nodePage([callSite])),
    );
    const service = new GraphViewService(fakeRepository({ declaredInterface, callSitesOf }));

    await service.declaredInterface(SCOPE, { id: 'sA', limit: 5, cursor: 'c' });
    await service.callSites(SCOPE, { id: 'sA' });

    expect(declaredInterface).toHaveBeenCalledWith(SCOPE, 'sA', { limit: 5, cursor: 'c' });
    expect(callSitesOf).toHaveBeenCalledWith(SCOPE, 'sA', { limit: undefined, cursor: undefined });
  });

  it('forwards container declarations paging options with the scope (D2)', async () => {
    const containedDeclarations = vi.fn(
      (_scope: GraphScope, _id: SymbolId, _options?: PageOptions) =>
        Promise.resolve(nodePage([nodeA])),
    );
    const service = new GraphViewService(fakeRepository({ containedDeclarations }));

    const page = await service.declarations(SCOPE, { id: 'pkgA', limit: 3 });

    expect(containedDeclarations).toHaveBeenCalledWith(SCOPE, 'pkgA', {
      limit: 3,
      cursor: undefined,
    });
    expect(page.items.map((n) => n.id)).toEqual(['sA']);
  });

  it('stitches a call-site payload to the params it binds, leaving unbound args null (D1)', async () => {
    const boundArg = {
      ordinal: 0,
      name: 'label',
      passKind: 'named' as const,
      value: '"x"',
      resolution: 'deterministic' as const,
    };
    const spreadArg = {
      ordinal: 1,
      passKind: 'spread' as const,
      value: 'rest',
      resolution: 'inferred' as const,
      confidence: 'low' as const,
    };
    const callSiteNode: Node = {
      kind: 'callSite',
      id: 'cs9',
      enclosingSymbolId: 'sA',
      callee: 'Widget',
      ordinal: 0,
      payload: [boundArg, spreadArg],
      properties: {},
    };
    const bindingEdge: Edge = {
      kind: 'references',
      sourceId: 'cs9',
      targetId: 'propP1',
      subKind: 'react:propBinding',
      resolution: 'deterministic',
      provenance: { pass: 'resolve', rule: 'react/binds-prop' },
    };
    const service = new GraphViewService(
      fakeRepository({
        getNode: () => Promise.resolve(callSiteNode),
        neighbors: (_scope, _id, _direction, _kind) =>
          Promise.resolve([{ edge: bindingEdge, node: propP1 }]),
      }),
    );

    const view = await service.callBindings(SCOPE, { id: 'cs9' });
    expect(view?.callSite.id).toBe('cs9');
    expect(view?.bindings).toEqual([
      { argument: boundArg, parameter: propP1, edge: bindingEdge },
      { argument: spreadArg, parameter: null, edge: null },
    ]);
  });

  it('returns null from call-bindings when the id is not a call-site', async () => {
    const service = new GraphViewService(fakeRepository({ getNode: () => Promise.resolve(nodeA) }));
    expect(await service.callBindings(SCOPE, { id: 'sA' })).toBeNull();
  });

  it('carries the page total through to the envelope, and omits it when absent (D9)', async () => {
    const withTotal = new GraphViewService(
      fakeRepository({
        search: () => Promise.resolve({ items: [nodeA], nextCursor: 'c', total: 42 }),
      }),
    );
    expect(await withTotal.search(SCOPE, {})).toEqual({
      items: [nodeA],
      nextCursor: 'c',
      total: 42,
    });

    const without = new GraphViewService(
      fakeRepository({ search: () => Promise.resolve({ items: [nodeA], nextCursor: null }) }),
    );
    const page = await without.search(SCOPE, {});
    expect('total' in page).toBe(false);
  });
});
