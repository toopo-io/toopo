/**
 * B1.2 SECURITY PROOF — cross-project graph isolation (ADR-0022 §3) on both
 * backends. Two projects (p1, p2) are persisted into the SAME database with
 * DELIBERATELY IDENTICAL SymbolIds (`sym:A`, `sym:B`, `file:x.ts`, `repo`, `pkg`)
 * but different content and different edges. Every Serve read primitive is then
 * asserted to return ONLY the queried project's graph and never the other's.
 *
 * This is the data-layer guarantee beneath the API guard (defense-in-depth): the
 * composite primary key `(project_id, id)` and the mandatory {@link GraphScope}
 * make a cross-tenant row unreturnable even if an HTTP guard were bypassed. The
 * sharpest proof is blast-radius: `sym:A` depends on `sym:B` via a DETERMINISTIC
 * `calls` edge in p1 and an INFERRED `references` edge in p2, so the identical hit
 * id carries a different `pathResolution` per project — proof the recursive CTE
 * traversed only the scoped project's edges.
 */
import { type Edge, FORMAT_VERSION, type GraphDocument, type Node } from '@toopo/core';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR } from '../migrations-dir.js';
import { migrateToLatest } from '../migrator.js';
import type { GraphDatabase } from '../schema/graph-types.js';
import { type BackendHarness, SKIP_POSTGRES, startBackend } from '../test-support/backends.js';
import { KyselyGraphRepository } from './graph.repository.kysely.js';
import type { GraphScope } from './graph-scope.js';

const P1: GraphScope = { projectId: 'p1' };
const P2: GraphScope = { projectId: 'p2' };

function contains(sourceId: string, targetId: string): Edge {
  return {
    kind: 'contains',
    sourceId,
    targetId,
    resolution: 'deterministic',
    provenance: { pass: 'parse', rule: 'containment' },
  };
}

/** Build one project's graph: same ids in both, distinct content + a distinct A→B edge. */
function buildDocument(input: {
  readonly repoName: string;
  readonly packageName: string;
  readonly contentHash: string;
  readonly aName: string;
  readonly bName: string;
  readonly onlyId: string;
  readonly onlyName: string;
  readonly propId: string;
  readonly callSiteId: string;
  readonly callee: string;
  readonly abEdge: Edge;
}): GraphDocument {
  const nodes: Node[] = [
    { kind: 'repo', id: 'repo', name: input.repoName, properties: {} },
    { kind: 'package', id: 'pkg', name: input.packageName, version: '1.0.0', properties: {} },
    {
      kind: 'file',
      id: 'file:x.ts',
      path: 'x.ts',
      contentHash: input.contentHash,
      analysis: { status: 'analyzed' },
      properties: {},
    },
    { kind: 'symbol', id: 'sym:A', name: input.aName, subKind: 'react:component', properties: {} },
    { kind: 'symbol', id: 'sym:B', name: input.bName, properties: {} },
    { kind: 'symbol', id: input.onlyId, name: input.onlyName, properties: {} },
    { kind: 'symbol', id: input.propId, name: 'prop', subKind: 'react:prop', properties: {} },
    {
      kind: 'callSite',
      id: input.callSiteId,
      enclosingSymbolId: 'sym:A',
      callee: input.callee,
      ordinal: 0,
      payload: [],
      properties: {},
    },
  ];
  const edges: Edge[] = [
    contains('repo', 'pkg'),
    contains('pkg', 'file:x.ts'),
    contains('file:x.ts', 'sym:A'),
    contains('file:x.ts', 'sym:B'),
    contains('file:x.ts', input.onlyId),
    contains('sym:A', input.propId),
    contains('sym:A', input.callSiteId),
    input.abEdge,
  ];
  return { formatVersion: FORMAT_VERSION, nodes, edges };
}

const documentP1 = buildDocument({
  repoName: 'r1',
  packageName: '@p/one',
  contentHash: 'h1',
  aName: 'AlphaOne',
  bName: 'BetaOne',
  onlyId: 'sym:onlyP1',
  onlyName: 'OnlyOne',
  propId: 'prop:p1',
  callSiteId: 'cs:p1:0',
  callee: 'BetaOne',
  // p1: A depends on B by a DETERMINISTIC calls edge.
  abEdge: {
    kind: 'calls',
    sourceId: 'sym:A',
    targetId: 'sym:B',
    resolution: 'deterministic',
    provenance: { pass: 'resolve', rule: 'call' },
  },
});

const documentP2 = buildDocument({
  repoName: 'r2',
  packageName: '@p/two',
  contentHash: 'h2',
  aName: 'AlphaTwo',
  bName: 'BetaTwo',
  onlyId: 'sym:onlyP2',
  onlyName: 'OnlyTwo',
  propId: 'prop:p2',
  callSiteId: 'cs:p2:0',
  callee: 'BetaTwo',
  // p2: A depends on B by an INFERRED references edge (same ids, different trust).
  abEdge: {
    kind: 'references',
    sourceId: 'sym:A',
    targetId: 'sym:B',
    resolution: 'inferred',
    confidence: 'medium',
    provenance: { pass: 'resolve', rule: 'type-ref' },
  },
});

const backends = [
  { backend: 'sqlite' as const, skip: false },
  { backend: 'postgres' as const, skip: SKIP_POSTGRES },
];

for (const { backend, skip } of backends) {
  describe.skipIf(skip)(`cross-project graph isolation [${backend}]`, () => {
    let harness: BackendHarness;
    let repository: KyselyGraphRepository;

    beforeAll(async () => {
      harness = await startBackend(backend);
      const db = harness.db as unknown as Kysely<GraphDatabase>;
      await migrateToLatest({ db: harness.db, backend, rootDir: MIGRATIONS_DIR });
      repository = new KyselyGraphRepository(db);
      // Both projects share one database and the same SymbolIds.
      await repository.persistGraph(P1, documentP1);
      await repository.persistGraph(P2, documentP2);
    }, 120_000);

    afterAll(async () => {
      await harness?.cleanup();
    });

    it('stores the same SymbolId as two distinct rows, one per project', async () => {
      const a1 = await repository.getNode(P1, 'sym:A');
      const a2 = await repository.getNode(P2, 'sym:A');
      expect(a1?.kind === 'symbol' && a1.name).toBe('AlphaOne');
      expect(a2?.kind === 'symbol' && a2.name).toBe('AlphaTwo');
      const pkg1 = await repository.getNode(P1, 'pkg');
      const pkg2 = await repository.getNode(P2, 'pkg');
      expect(pkg1?.kind === 'package' && pkg1.name).toBe('@p/one');
      expect(pkg2?.kind === 'package' && pkg2.name).toBe('@p/two');
    });

    it('never returns a node that exists only in the other project', async () => {
      expect(await repository.getNode(P1, 'sym:onlyP2')).toBeNull();
      expect(await repository.getNode(P2, 'sym:onlyP1')).toBeNull();
    });

    it('scopes neighbors to the project (different A→B edge per project)', async () => {
      const out1 = await repository.neighbors(P1, 'sym:A', 'out');
      const out2 = await repository.neighbors(P2, 'sym:A', 'out');
      const kinds1 = new Set(out1.map((n) => n.edge.kind));
      const kinds2 = new Set(out2.map((n) => n.edge.kind));
      expect(kinds1.has('calls')).toBe(true);
      expect(kinds1.has('references')).toBe(false);
      expect(kinds2.has('references')).toBe(true);
      expect(kinds2.has('calls')).toBe(false);
      // The hydrated far node is the queried project's sym:B, never the other's.
      const b1 = out1.find((n) => n.edge.targetId === 'sym:B')?.node;
      const b2 = out2.find((n) => n.edge.targetId === 'sym:B')?.node;
      expect(b1?.kind === 'symbol' && b1.name).toBe('BetaOne');
      expect(b2?.kind === 'symbol' && b2.name).toBe('BetaTwo');
    });

    it('scopes neighborsPage to the project', async () => {
      const calls1 = await repository.neighborsPage(P1, 'sym:A', 'out', { kind: 'calls' });
      const calls2 = await repository.neighborsPage(P2, 'sym:A', 'out', { kind: 'calls' });
      expect(calls1.items.map((n) => n.edge.targetId)).toEqual(['sym:B']);
      expect(calls2.items).toEqual([]); // p2 has no calls edge — only references.
    });

    it('scopes the blast-radius CTE — same hit id, project-specific trust', async () => {
      const hits1 = await repository.blastRadius(P1, 'sym:B');
      const hits2 = await repository.blastRadius(P2, 'sym:B');
      expect(hits1.map((h) => h.nodeId)).toEqual(['sym:A']);
      expect(hits2.map((h) => h.nodeId)).toEqual(['sym:A']);
      // The recursive join only traversed the scoped project's edges, so the
      // identical hit carries each project's own trust (ADR-0021 + ADR-0022 §3).
      expect(hits1[0]?.pathResolution).toBe('deterministic');
      expect(hits2[0]?.pathResolution).toBe('inferred');
    });

    it('scopes the hydrated, paginated blast radius', async () => {
      const page1 = await repository.blastRadiusPage(P1, 'sym:B');
      const page2 = await repository.blastRadiusPage(P2, 'sym:B');
      expect(page1.items.map((h) => h.pathResolution)).toEqual(['deterministic']);
      expect(page2.items.map((h) => h.pathResolution)).toEqual(['inferred']);
    });

    it('scopes search to the project', async () => {
      expect((await repository.search(P1, { query: 'AlphaOne' })).items.map((n) => n.id)).toEqual([
        'sym:A',
      ]);
      expect((await repository.search(P2, { query: 'AlphaOne' })).items).toEqual([]);
      expect((await repository.search(P1, { query: 'OnlyTwo' })).items).toEqual([]);
      expect((await repository.search(P2, { query: 'OnlyTwo' })).items.map((n) => n.id)).toEqual([
        'sym:onlyP2',
      ]);
    });

    it('scopes the declared interface to the project', async () => {
      expect((await repository.declaredInterface(P1, 'sym:A')).items.map((n) => n.id)).toEqual([
        'prop:p1',
      ]);
      expect((await repository.declaredInterface(P2, 'sym:A')).items.map((n) => n.id)).toEqual([
        'prop:p2',
      ]);
    });

    it('scopes call-sites to the project', async () => {
      const cs1 = await repository.callSitesOf(P1, 'sym:A');
      const cs2 = await repository.callSitesOf(P2, 'sym:A');
      expect(cs1.items.map((n) => n.id)).toEqual(['cs:p1:0']);
      expect(cs2.items.map((n) => n.id)).toEqual(['cs:p2:0']);
    });

    it('scopes the aggregate map to the project', async () => {
      const map1 = await repository.mapView(P1, { level: 'package' });
      const map2 = await repository.mapView(P2, { level: 'package' });
      expect(map1.nodes.map((n) => n.node.kind === 'package' && n.node.name)).toEqual(['@p/one']);
      expect(map2.nodes.map((n) => n.node.kind === 'package' && n.node.name)).toEqual(['@p/two']);
    });

    it('isolates persistence — one project write never alters the other', async () => {
      // Re-persisting p2 must leave p1 untouched and idempotent on both.
      const again = await repository.persistGraph(P2, documentP2);
      expect(again).toEqual({ nodes: 8, edges: 8 });
      const a1 = await repository.getNode(P1, 'sym:A');
      expect(a1?.kind === 'symbol' && a1.name).toBe('AlphaOne');
    });
  });
}
