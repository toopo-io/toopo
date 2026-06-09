/**
 * S3 — persistGraph + getNode on both backends. Persists a small but
 * representative graph (the full containment chain repo>package>file>symbol>
 * callSite, a calls edge, an inferred references edge, and an edge to an
 * EXTERNAL target with no node row), then asserts: every node rehydrates
 * losslessly, a missing id is null, file_id is populated from containment, an
 * external target has no node row, and re-persisting is idempotent (stable
 * counts and stable table sizes).
 */
import { type Edge, FORMAT_VERSION, type GraphDocument, type Node } from '@toopo/core';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR } from '../migrations-dir.js';
import { migrateToLatest } from '../migrator.js';
import type { GraphDatabase } from '../schema/graph-types.js';
import { type BackendHarness, SKIP_POSTGRES, startBackend } from '../test-support/backends.js';
import { KyselyGraphRepository } from './graph.repository.kysely.js';

const repo: Node = { kind: 'repo', id: 'repo', name: 'toopo', properties: {} };
const pkg: Node = {
  kind: 'package',
  id: 'pkg',
  name: '@toopo/core',
  version: '0.0.0',
  properties: {},
};
const file: Node = {
  kind: 'file',
  id: 'file:a.ts',
  path: 'a.ts',
  contentHash: 'sha256:aaa',
  analysis: { status: 'analyzed' },
  properties: {},
};
const symbolA: Node = {
  kind: 'symbol',
  id: 'sym:A',
  name: 'A',
  subKind: 'ts:function',
  properties: { exported: true },
};
const symbolB: Node = { kind: 'symbol', id: 'sym:B', name: 'B', properties: {} };
const callSite: Node = {
  kind: 'callSite',
  id: 'cs:A:0',
  enclosingSymbolId: 'sym:A',
  callee: 'B',
  ordinal: 0,
  payload: [],
  properties: {},
};

function contains(sourceId: string, targetId: string): Edge {
  return {
    kind: 'contains',
    sourceId,
    targetId,
    resolution: 'deterministic',
    provenance: { pass: 'parse', rule: 'containment' },
  };
}

const callsEdge: Edge = {
  kind: 'calls',
  sourceId: 'sym:A',
  targetId: 'sym:B',
  resolution: 'deterministic',
  provenance: { pass: 'resolve', rule: 'call-graph' },
};

const externalRef: Edge = {
  kind: 'references',
  sourceId: 'sym:A',
  targetId: 'npm react Component#',
  subKind: 'ts:typeRef',
  resolution: 'inferred',
  confidence: 'medium',
  provenance: { pass: 'resolve', rule: 'type-ref' },
};

const document: GraphDocument = {
  formatVersion: FORMAT_VERSION,
  nodes: [repo, pkg, file, symbolA, symbolB, callSite],
  edges: [
    contains('repo', 'pkg'),
    contains('pkg', 'file:a.ts'),
    contains('file:a.ts', 'sym:A'),
    contains('file:a.ts', 'sym:B'),
    contains('sym:A', 'cs:A:0'),
    callsEdge,
    externalRef,
  ],
};

async function tableCount(db: Kysely<GraphDatabase>, table: 'node' | 'edge'): Promise<number> {
  const row = await db
    .selectFrom(table)
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .executeTakeFirstOrThrow();
  return Number(row.count);
}

const backends = [
  { backend: 'sqlite' as const, skip: false },
  { backend: 'postgres' as const, skip: SKIP_POSTGRES },
];

for (const { backend, skip } of backends) {
  describe.skipIf(skip)(`KyselyGraphRepository persist/getNode [${backend}]`, () => {
    let harness: BackendHarness;
    let db: Kysely<GraphDatabase>;
    let repository: KyselyGraphRepository;

    beforeAll(async () => {
      harness = await startBackend(backend);
      db = harness.db as unknown as Kysely<GraphDatabase>;
      await migrateToLatest({ db: harness.db, backend, rootDir: MIGRATIONS_DIR });
      repository = new KyselyGraphRepository(db);
    }, 120_000);

    afterAll(async () => {
      await harness?.cleanup();
    });

    it('persists the document and reports deduped counts', async () => {
      const result = await repository.persistGraph(document);
      expect(result).toEqual({ nodes: 6, edges: 7 });
    });

    it('rehydrates every persisted node losslessly', async () => {
      for (const node of document.nodes) {
        expect(await repository.getNode(node.id)).toEqual(node);
      }
    });

    it('returns null for a missing id and for an external (node-less) target', async () => {
      expect(await repository.getNode('does-not-exist')).toBeNull();
      expect(await repository.getNode('npm react Component#')).toBeNull();
    });

    it('populates file_id from the containment hierarchy', async () => {
      const rows = await db
        .selectFrom('node')
        .select(['id', 'file_id'])
        .where('id', 'in', ['repo', 'pkg', 'file:a.ts', 'sym:A', 'cs:A:0'])
        .execute();
      const fileIdById = new Map(rows.map((r) => [r.id, r.file_id]));
      expect(fileIdById.get('repo')).toBeNull();
      expect(fileIdById.get('pkg')).toBeNull();
      expect(fileIdById.get('file:a.ts')).toBe('file:a.ts');
      expect(fileIdById.get('sym:A')).toBe('file:a.ts');
      expect(fileIdById.get('cs:A:0')).toBe('file:a.ts');
    });

    it('assigns an edge to its source file', async () => {
      const row = await db
        .selectFrom('edge')
        .select('file_id')
        .where('source_id', '=', 'sym:A')
        .where('kind', '=', 'calls')
        .executeTakeFirstOrThrow();
      expect(row.file_id).toBe('file:a.ts');
    });

    it('is idempotent — re-persisting leaves row counts unchanged', async () => {
      const before = { nodes: await tableCount(db, 'node'), edges: await tableCount(db, 'edge') };
      const result = await repository.persistGraph(document);
      expect(result).toEqual({ nodes: 6, edges: 7 });
      expect(await tableCount(db, 'node')).toBe(before.nodes);
      expect(await tableCount(db, 'edge')).toBe(before.edges);
    });
  });
}
