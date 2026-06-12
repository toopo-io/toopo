/**
 * ADR-0029 — the deterministic global derived views on both backends, over one
 * fixture built to exercise the top-level scope precisely:
 *
 *   repo ─contains→ pkg
 *   pkg  ─contains→ fileA, fileB
 *   fileA ─contains→ btnA ('Button'), helper ('helper')
 *   fileB ─contains→ btnB ('Button'), widget ('widget')
 *   helper ─contains→ nestedWidget ('widget')   (nested — NOT top-level)
 *   btnA   ─contains→ propButton ('Button')      (a prop — NOT top-level)
 *
 * Top-level symbols: btnA, helper, btnB, widget. Only 'Button' is shared by two
 * of them, so the nested 'widget' and the prop 'Button' must NOT inflate any
 * collision — the test of the contains-from-file predicate (ADR-0029 §2).
 *
 * D5 (name collisions) lands here; D6 (unused) and D7 (cycles) append.
 */
import {
  type Edge,
  FORMAT_VERSION,
  type GraphDocument,
  type Node,
  type UnresolvedReference,
} from '@toopo/core';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR } from '../migrations-dir.js';
import { migrateToLatest } from '../migrator.js';
import type { GraphDatabase } from '../schema/graph-types.js';
import { type BackendHarness, SKIP_POSTGRES, startBackend } from '../test-support/backends.js';
import { KyselyGraphRepository } from './graph.repository.kysely.js';
import type { Page } from './graph-page.js';

const repo: Node = { kind: 'repo', id: 'repo', name: 'repo', properties: {} };
const pkg: Node = { kind: 'package', id: 'pkg', name: '@x/a', properties: {} };
const file = (id: string, path: string): Node => ({
  kind: 'file',
  id,
  path,
  contentHash: id,
  analysis: { status: 'analyzed' },
  properties: {},
});
const symbol = (id: string, name: string, subKind?: string): Node => ({
  kind: 'symbol',
  id,
  name,
  ...(subKind === undefined ? {} : { subKind }),
  properties: {},
});

const fileA = file('fileA', 'a.ts');
const fileB = file('fileB', 'b.ts');
const btnA = symbol('sym:a:Button', 'Button', 'react:component');
const helper = symbol('sym:a:helper', 'helper');
const btnB = symbol('sym:b:Button', 'Button', 'react:component');
const widget = symbol('sym:b:widget', 'widget', 'react:component');
const nestedWidget = symbol('sym:a:helper:widget~~', 'widget');
const propButton = symbol('sym:a:Button:prop', 'Button', 'react:prop');

function edge(kind: Edge['kind'], sourceId: string, targetId: string): Edge {
  return {
    kind,
    sourceId,
    targetId,
    resolution: 'deterministic',
    provenance: { pass: 'parse', rule: 't' },
  };
}

const document: GraphDocument = {
  formatVersion: FORMAT_VERSION,
  nodes: [repo, pkg, fileA, fileB, btnA, helper, btnB, widget, nestedWidget, propButton],
  edges: [
    edge('contains', 'repo', 'pkg'),
    edge('contains', 'pkg', 'fileA'),
    edge('contains', 'pkg', 'fileB'),
    edge('contains', 'fileA', 'sym:a:Button'),
    edge('contains', 'fileA', 'sym:a:helper'),
    edge('contains', 'fileB', 'sym:b:Button'),
    edge('contains', 'fileB', 'sym:b:widget'),
    edge('contains', 'sym:a:helper', 'sym:a:helper:widget~~'),
    edge('contains', 'sym:a:Button', 'sym:a:Button:prop'),
  ],
};

const EMPTY: GraphDocument = { formatVersion: FORMAT_VERSION, nodes: [], edges: [] };
const SCOPE = { projectId: 'proj-global' };

// ── D7 fixture: a 2-cycle (sa↔sb), a self-loop (se→se), and a plain chain
// (sc→sd). The in/out-degree pre-filter must keep the cycle and self-loop edges
// and drop the chain (sc has no incoming dependency edge).
const fileG = file('fileG', 'g.ts');
const D7_DOC: GraphDocument = {
  formatVersion: FORMAT_VERSION,
  nodes: [
    repo,
    pkg,
    fileG,
    symbol('sa', 'a'),
    symbol('sb', 'b'),
    symbol('sc', 'c'),
    symbol('sd', 'd'),
    symbol('se', 'e'),
  ],
  edges: [
    edge('contains', 'repo', 'pkg'),
    edge('contains', 'pkg', 'fileG'),
    edge('contains', 'fileG', 'sa'),
    edge('contains', 'fileG', 'sb'),
    edge('contains', 'fileG', 'sc'),
    edge('contains', 'fileG', 'sd'),
    edge('contains', 'fileG', 'se'),
    edge('calls', 'sa', 'sb'),
    edge('calls', 'sb', 'sa'),
    edge('calls', 'sc', 'sd'), // a chain — neither endpoint closes a loop
    edge('calls', 'se', 'se'), // direct recursion
  ],
};

// ── D6 fixture: one file of top-level symbols exercising every unused/candidate
// branch. `used` and `base` have incoming usage (a call, an extends) so they are
// excluded; the rest are unused, classified by the tail and the exports edge.
const fileF = file('fileF', 'f.ts');
const D6_NODES: readonly Node[] = [
  repo,
  pkg,
  fileF,
  symbol('sym:f:caller', 'caller'),
  symbol('sym:f:used', 'used'),
  symbol('sym:f:dead', 'dead'),
  symbol('sym:f:exportedDead', 'exportedDead'),
  symbol('sym:f:item', 'Item'),
  symbol('sym:f:run', 'run'),
  symbol('sym:f:base', 'Base'),
  symbol('sym:f:sub', 'Sub'),
];
const D6_DOC: GraphDocument = {
  formatVersion: FORMAT_VERSION,
  nodes: [...D6_NODES],
  edges: [
    edge('contains', 'repo', 'pkg'),
    edge('contains', 'pkg', 'fileF'),
    edge('contains', 'fileF', 'sym:f:caller'),
    edge('contains', 'fileF', 'sym:f:used'),
    edge('contains', 'fileF', 'sym:f:dead'),
    edge('contains', 'fileF', 'sym:f:exportedDead'),
    edge('contains', 'fileF', 'sym:f:item'),
    edge('contains', 'fileF', 'sym:f:run'),
    edge('contains', 'fileF', 'sym:f:base'),
    edge('contains', 'fileF', 'sym:f:sub'),
    edge('calls', 'sym:f:caller', 'sym:f:used'), // `used` has incoming usage → excluded
    edge('extends', 'sym:f:sub', 'sym:f:base'), // `base` is extended → usage → excluded
    edge('exports', 'fileF', 'sym:f:exportedDead'), // the export fact
  ],
};
// The tail: an anchored member usage exonerates 'Item' (target fileF + name),
// an anchorless callee exonerates 'run' by name — both become candidates.
const D6_REFS: readonly UnresolvedReference[] = [
  {
    code: 'unresolved-member',
    importerFileId: 'fileX',
    specifier: 'Thing.Item',
    targetFileId: 'fileF',
    name: 'Item',
    message: 'Unresolved member "Item" on "Thing.Item"',
  },
  {
    code: 'unbound-callee',
    importerFileId: 'fileX',
    specifier: 'handler.run',
    name: 'run',
    message: 'Unbound callee root for member "run" on "handler.run"',
  },
];

async function drain<T>(fetch: (cursor: string | undefined) => Promise<Page<T>>): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | undefined;
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
  describe.skipIf(skip)(`Global derived views [${backend}]`, () => {
    let harness: BackendHarness;
    let repository: KyselyGraphRepository;

    beforeAll(async () => {
      harness = await startBackend(backend);
      const db = harness.db as unknown as Kysely<GraphDatabase>;
      await migrateToLatest({ db: harness.db, backend, rootDir: MIGRATIONS_DIR });
      repository = new KyselyGraphRepository(db);
      await repository.replaceProjectGraph(SCOPE, document);
    }, 120_000);

    afterAll(async () => {
      await harness?.cleanup();
    });

    describe('nameCollisions (D5)', () => {
      it('returns only top-level symbols sharing a name, excluding nested and props', async () => {
        const all = await drain((cursor) => repository.nameCollisions(SCOPE, { limit: 1, cursor }));
        // 'Button' is shared by two top-level symbols; the nested 'widget' and the
        // prop 'Button' are excluded, so neither 'widget' nor a third 'Button' appears.
        expect(all.map((n) => n.id)).toEqual(['sym:a:Button', 'sym:b:Button']);
        expect(all.every((n) => n.name === 'Button')).toBe(true);
      });

      it('reports the total on the first page and is byte-identical on a re-walk', async () => {
        const first = await repository.nameCollisions(SCOPE, { limit: 1 });
        expect(first.total).toBe(2);
        const a = await drain((c) => repository.nameCollisions(SCOPE, { limit: 1, cursor: c }));
        const b = await drain((c) => repository.nameCollisions(SCOPE, { limit: 1, cursor: c }));
        expect(JSON.stringify(b)).toBe(JSON.stringify(a));
      });

      it('is empty for a project whose top-level names are all unique', async () => {
        const scope = { projectId: 'proj-global-unique' };
        await repository.replaceProjectGraph(scope, {
          formatVersion: FORMAT_VERSION,
          nodes: [repo, pkg, fileA, symbol('sym:u:one', 'one'), symbol('sym:u:two', 'two')],
          edges: [
            edge('contains', 'repo', 'pkg'),
            edge('contains', 'pkg', 'fileA'),
            edge('contains', 'fileA', 'sym:u:one'),
            edge('contains', 'fileA', 'sym:u:two'),
          ],
        });
        expect((await repository.nameCollisions(scope)).items).toEqual([]);
      });

      it('scopes by project — another project tail never leaks in', async () => {
        const other = { projectId: 'proj-global-other' };
        await repository.replaceProjectGraph(other, EMPTY);
        expect((await repository.nameCollisions(other)).items).toEqual([]);
      });
    });

    describe('unusedSymbols (D6)', () => {
      const d6 = { projectId: 'proj-unused' };

      beforeAll(async () => {
        await repository.replaceProjectGraph(d6, D6_DOC, D6_REFS);
      });

      it('lists only top-level symbols with zero incoming usage (extends/calls count)', async () => {
        const all = await drain((c) => repository.unusedSymbols(d6, { limit: 2, cursor: c }));
        // `used` (incoming call) and `base` (incoming extends) are used → excluded.
        expect(all.map((u) => u.node.id)).toEqual([
          'sym:f:caller',
          'sym:f:dead',
          'sym:f:exportedDead',
          'sym:f:item',
          'sym:f:run',
          'sym:f:sub',
        ]);
      });

      it('marks a symbol a candidate when an unresolved usage could reach it', async () => {
        const all = await drain((c) => repository.unusedSymbols(d6, { cursor: c }));
        const byId = new Map(all.map((u) => [u.node.id, u]));
        // 'Item' is exonerated by an anchored unresolved-member (file + name);
        // 'run' by an anchorless unbound-callee (name) — both possibly-used.
        expect(byId.get('sym:f:item')?.candidate).toBe(true);
        expect(byId.get('sym:f:run')?.candidate).toBe(true);
        // No unresolved usage could reach these — certain-unused.
        expect(byId.get('sym:f:dead')?.candidate).toBe(false);
        expect(byId.get('sym:f:caller')?.candidate).toBe(false);
      });

      it('surfaces the exported fact (an exports edge), asserting no verdict', async () => {
        const all = await drain((c) => repository.unusedSymbols(d6, { cursor: c }));
        const byId = new Map(all.map((u) => [u.node.id, u]));
        expect(byId.get('sym:f:exportedDead')?.exported).toBe(true);
        expect(byId.get('sym:f:dead')?.exported).toBe(false);
      });

      it('reports the total on the first page and is byte-identical on a re-walk', async () => {
        expect((await repository.unusedSymbols(d6, { limit: 2 })).total).toBe(6);
        const a = await drain((c) => repository.unusedSymbols(d6, { limit: 2, cursor: c }));
        const b = await drain((c) => repository.unusedSymbols(d6, { limit: 2, cursor: c }));
        expect(JSON.stringify(b)).toBe(JSON.stringify(a));
      });
    });

    describe('cyclicDependencyEdges (D7)', () => {
      const d7 = { projectId: 'proj-cycles' };

      beforeAll(async () => {
        await repository.replaceProjectGraph(d7, D7_DOC);
      });

      it('keeps the cycle and self-loop edges, dropping the acyclic chain', async () => {
        const all = await drain((c) =>
          repository.cyclicDependencyEdges(d7, { limit: 2, cursor: c }),
        );
        const pairs = all.map((e) => `${e.sourceId}->${e.targetId}`).sort();
        // sa↔sb close a loop; se→se is direct recursion; sc→sd is dropped (sc has
        // no incoming dependency edge — the in/out-degree pre-filter, ADR-0029).
        expect(pairs).toEqual(['sa->sb', 'sb->sa', 'se->se']);
        expect(all.every((e) => e.resolution === 'deterministic')).toBe(true);
      });

      it('carries a stable key and is byte-identical on a re-walk', async () => {
        const a = await drain((c) => repository.cyclicDependencyEdges(d7, { limit: 2, cursor: c }));
        const b = await drain((c) => repository.cyclicDependencyEdges(d7, { limit: 2, cursor: c }));
        expect(JSON.stringify(b)).toBe(JSON.stringify(a));
        expect(a.every((e) => e.key.length > 0)).toBe(true);
      });
    });
  });
}
