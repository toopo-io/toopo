/**
 * ADR-0020 Phase A — the Serve read primitives on both backends, over one small
 * but representative graph: two packages, three files, symbols with declared
 * props and a call-site, and dependency edges of both resolutions plus an
 * external (node-less) target.
 *
 *   repo ─contains→ pkgA, pkgB
 *   pkgA ─contains→ fileA1, fileA2      pkgB ─contains→ fileB1
 *   fileA1 ─contains→ sA                fileA2 ─contains→ sA2   fileB1 ─contains→ sB
 *   sA ─contains→ propP1, propP2, cs1
 *
 *   sA  ─calls→ sA2          (deterministic, intra-package, cross-file)
 *   sA  ─references→ sB      (inferred,  cross-package)
 *   sA2 ─imports→ sB         (deterministic, cross-package)
 *   sA  ─references→ EXT     (inferred,  external — no node row)
 *
 * Covers: paginated neighbors, search, declared-interface, call-sites, bounded
 * blast-radius (+truncated), and the on-read aggregate map at all three levels.
 */
import { type Edge, FORMAT_VERSION, type GraphDocument, type Node } from '@toopo/core';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR } from '../migrations-dir.js';
import { migrateToLatest } from '../migrator.js';
import type { GraphDatabase } from '../schema/graph-types.js';
import { type BackendHarness, SKIP_POSTGRES, startBackend } from '../test-support/backends.js';
import { KyselyGraphRepository } from './graph.repository.kysely.js';
import type { Page } from './graph-page.js';

const repo: Node = { kind: 'repo', id: 'repo', name: 'repo', properties: {} };
const pkgA: Node = { kind: 'package', id: 'pkgA', name: '@x/a', properties: {} };
const pkgB: Node = { kind: 'package', id: 'pkgB', name: '@x/b', properties: {} };
const fileA1: Node = {
  kind: 'file',
  id: 'fileA1',
  path: 'a/one.ts',
  contentHash: 'h1',
  analysis: { status: 'analyzed' },
  properties: {},
};
const fileA2: Node = {
  kind: 'file',
  id: 'fileA2',
  path: 'a/two.ts',
  contentHash: 'h2',
  analysis: { status: 'analyzed' },
  properties: {},
};
const fileB1: Node = {
  kind: 'file',
  id: 'fileB1',
  path: 'b/one.ts',
  contentHash: 'h3',
  analysis: { status: 'analyzed' },
  properties: {},
};
const sA: Node = {
  kind: 'symbol',
  id: 'sA',
  name: 'Widget',
  subKind: 'react:component',
  properties: {},
};
const sA2: Node = { kind: 'symbol', id: 'sA2', name: 'helper', properties: {} };
const sB: Node = {
  kind: 'symbol',
  id: 'sB',
  name: 'Button',
  subKind: 'react:component',
  properties: {},
};
const propP1: Node = {
  kind: 'symbol',
  id: 'propP1',
  name: 'label',
  subKind: 'react:prop',
  properties: {},
};
const propP2: Node = {
  kind: 'symbol',
  id: 'propP2',
  name: 'onClick',
  subKind: 'react:prop',
  properties: {},
};
const cs1: Node = {
  kind: 'callSite',
  id: 'cs1',
  enclosingSymbolId: 'sA',
  callee: 'helper',
  ordinal: 0,
  payload: [],
  properties: {},
};

function edge(kind: Edge['kind'], sourceId: string, targetId: string, inferred = false): Edge {
  const base = { kind, sourceId, targetId, provenance: { pass: 'resolve', rule: 't' } } as const;
  return inferred
    ? { ...base, resolution: 'inferred', confidence: 'medium' }
    : { ...base, resolution: 'deterministic' };
}

const document: GraphDocument = {
  formatVersion: FORMAT_VERSION,
  nodes: [repo, pkgA, pkgB, fileA1, fileA2, fileB1, sA, sA2, sB, propP1, propP2, cs1],
  edges: [
    edge('contains', 'repo', 'pkgA'),
    edge('contains', 'repo', 'pkgB'),
    edge('contains', 'pkgA', 'fileA1'),
    edge('contains', 'pkgA', 'fileA2'),
    edge('contains', 'pkgB', 'fileB1'),
    edge('contains', 'fileA1', 'sA'),
    edge('contains', 'fileA2', 'sA2'),
    edge('contains', 'fileB1', 'sB'),
    edge('contains', 'sA', 'propP1'),
    edge('contains', 'sA', 'propP2'),
    edge('contains', 'sA', 'cs1'),
    edge('calls', 'sA', 'sA2'),
    edge('references', 'sA', 'sB', true),
    edge('imports', 'sA2', 'sB'),
    edge('references', 'sA', 'EXT', true),
  ],
};

/** Drain every page of a paginated read, returning all items in order. */
async function drain<T>(fetch: (cursor: string | undefined) => Promise<Page<T>>): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | undefined;
  // Bounded by the fixture size; a runaway loop would fail the test, not hang CI.
  for (let guard = 0; guard < 100; guard += 1) {
    const page = await fetch(cursor);
    all.push(...page.items);
    if (page.nextCursor === null) {
      return all;
    }
    cursor = page.nextCursor;
  }
  throw new Error('drain: pagination did not terminate');
}

const backends = [
  { backend: 'sqlite' as const, skip: false },
  { backend: 'postgres' as const, skip: SKIP_POSTGRES },
];

for (const { backend, skip } of backends) {
  describe.skipIf(skip)(`Serve read primitives [${backend}]`, () => {
    let harness: BackendHarness;
    let repository: KyselyGraphRepository;

    beforeAll(async () => {
      harness = await startBackend(backend);
      const db = harness.db as unknown as Kysely<GraphDatabase>;
      await migrateToLatest({ db: harness.db, backend, rootDir: MIGRATIONS_DIR });
      repository = new KyselyGraphRepository(db);
      await repository.persistGraph(document);
    }, 120_000);

    afterAll(async () => {
      await harness?.cleanup();
    });

    describe('neighborsPage', () => {
      it('pages every forward edge of sA across small pages, then stops', async () => {
        const items = await drain((cursor) =>
          repository.neighborsPage('sA', 'out', { limit: 2, cursor }),
        );
        const keys = items.map((n) => `${n.edge.kind}:${n.edge.targetId}`).sort();
        expect(keys).toEqual([
          'calls:sA2',
          'contains:cs1',
          'contains:propP1',
          'contains:propP2',
          'references:EXT',
          'references:sB',
        ]);
      });

      it('filters by edge kind within a page', async () => {
        const page = await repository.neighborsPage('sA', 'out', { kind: 'calls' });
        expect(page.items.map((n) => n.edge.targetId)).toEqual(['sA2']);
        expect(page.nextCursor).toBeNull();
      });

      it('hydrates the far node and nulls an external target', async () => {
        const page = await repository.neighborsPage('sA', 'out', { kind: 'references' });
        const byTarget = new Map(page.items.map((n) => [n.edge.targetId, n.node?.id ?? null]));
        expect(byTarget.get('sB')).toBe('sB');
        expect(byTarget.get('EXT')).toBeNull();
      });
    });

    describe('search', () => {
      it('matches a name substring case-insensitively', async () => {
        const page = await repository.search({ query: 'button' });
        expect(page.items.map((n) => n.id)).toEqual(['sB']);
      });

      it('matches a file path substring', async () => {
        const page = await repository.search({ query: 'b/one' });
        expect(page.items.map((n) => n.id)).toEqual(['fileB1']);
      });

      it('filters by kind', async () => {
        const page = await repository.search({ kind: 'package' });
        expect(page.items.map((n) => n.id).sort()).toEqual(['pkgA', 'pkgB']);
      });

      it('filters by subKind and paginates by id', async () => {
        const items = await drain((cursor) =>
          repository.search({ subKind: 'react:prop', limit: 1, cursor }),
        );
        expect(items.map((n) => n.id)).toEqual(['propP1', 'propP2']);
      });

      it('treats LIKE wildcards in the query as literal text', async () => {
        const page = await repository.search({ query: '%' });
        expect(page.items).toEqual([]);
      });
    });

    describe('declaredInterface', () => {
      it('returns the contained child symbols (props), ordered by id', async () => {
        const page = await repository.declaredInterface('sA');
        expect(page.items.map((n) => ({ id: n.id, subKind: n.subKind }))).toEqual([
          { id: 'propP1', subKind: 'react:prop' },
          { id: 'propP2', subKind: 'react:prop' },
        ]);
      });

      it('excludes contained call-sites (non-symbol children)', async () => {
        const page = await repository.declaredInterface('sA');
        expect(page.items.some((n) => n.id === 'cs1')).toBe(false);
      });
    });

    describe('callSitesOf', () => {
      it('returns the call-sites enclosed by a symbol', async () => {
        const page = await repository.callSitesOf('sA');
        expect(page.items.map((n) => n.id)).toEqual(['cs1']);
        expect(page.items[0]?.kind).toBe('callSite');
      });

      it('returns an empty page for a symbol with no call-sites', async () => {
        const page = await repository.callSitesOf('sB');
        expect(page.items).toEqual([]);
        expect(page.nextCursor).toBeNull();
      });
    });

    describe('blastRadiusPage', () => {
      it('hydrates dependents and is not truncated under the default depth', async () => {
        const page = await repository.blastRadiusPage('sB');
        expect(page.items.map((h) => h.nodeId).sort()).toEqual(['sA', 'sA2']);
        expect(page.items.every((h) => h.node?.id === h.nodeId)).toBe(true);
        expect(page.truncated).toBe(false);
      });

      it('flags truncated when the depth cap is reached', async () => {
        const page = await repository.blastRadiusPage('sB', { maxDepth: 1 });
        expect(page.items.map((h) => h.nodeId).sort()).toEqual(['sA', 'sA2']);
        expect(page.truncated).toBe(true);
      });

      it('pages the hits by (depth, id)', async () => {
        const items = await drain((cursor) =>
          repository
            .blastRadiusPage('sB', { cursor, limit: 1 })
            .then((p) => ({ items: p.items, nextCursor: p.nextCursor })),
        );
        expect(items.map((h) => h.nodeId)).toEqual(['sA', 'sA2']);
      });
    });

    describe('mapView', () => {
      it('aggregates the package level with trust-split projected edges', async () => {
        const view = await repository.mapView({ level: 'package' });
        expect(view.nodes.map((n) => ({ id: n.node.id, childCount: n.childCount }))).toEqual([
          { id: 'pkgA', childCount: 4 },
          { id: 'pkgB', childCount: 1 },
        ]);
        expect(view.edges).toEqual([
          { sourceId: 'pkgA', targetId: 'pkgB', deterministic: 1, inferred: 1 },
        ]);
        expect(view.truncated).toBe(false);
      });

      it('aggregates files within a package scope', async () => {
        const view = await repository.mapView({ level: 'file', scope: 'pkgA' });
        expect(view.nodes.map((n) => ({ id: n.node.id, childCount: n.childCount }))).toEqual([
          { id: 'fileA1', childCount: 3 },
          { id: 'fileA2', childCount: 1 },
        ]);
        expect(view.edges).toEqual([
          { sourceId: 'fileA1', targetId: 'fileA2', deterministic: 1, inferred: 0 },
        ]);
      });

      it('aggregates symbols within a file scope', async () => {
        const view = await repository.mapView({ level: 'symbol', scope: 'fileA1' });
        const counts = new Map(view.nodes.map((n) => [n.node.id, n.childCount]));
        expect([...counts.keys()].sort()).toEqual(['propP1', 'propP2', 'sA']);
        expect(counts.get('sA')).toBe(3);
        expect(view.edges).toEqual([]);
      });

      it('caps containers and flags truncated', async () => {
        const view = await repository.mapView({ level: 'package', limit: 1 });
        expect(view.nodes).toHaveLength(1);
        expect(view.truncated).toBe(true);
      });

      it('rejects the symbol level without a scope', async () => {
        await expect(repository.mapView({ level: 'symbol' })).rejects.toThrow(/file scope/);
      });
    });
  });
}
