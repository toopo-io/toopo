/**
 * S4 — neighbors on both backends. A small graph exercises forward (`out`) and
 * reverse (`in`) traversal, the edge-kind filter, an empty result, and the two
 * external cases: a `null` far-end node for an external TARGET (out) and for an
 * external SOURCE (in).
 *
 *   file ─contains→ A, B
 *   A ─calls→ B            (deterministic)
 *   A ─references→ EXT     (inferred; EXT has no node row)
 *   EXTSRC ─calls→ A       (deterministic; EXTSRC has no node row)
 */
import { type Edge, FORMAT_VERSION, type GraphDocument, type Node } from '@toopo/core';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR } from '../migrations-dir.js';
import { migrateToLatest } from '../migrator.js';
import type { GraphDatabase } from '../schema/graph-types.js';
import { type BackendHarness, SKIP_POSTGRES, startBackend } from '../test-support/backends.js';
import type { Neighbor } from './graph.repository.js';
import { KyselyGraphRepository } from './graph.repository.kysely.js';

const file: Node = {
  kind: 'file',
  id: 'file',
  path: 'a.ts',
  contentHash: 'h',
  analysis: { status: 'analyzed' },
  properties: {},
};
const A: Node = { kind: 'symbol', id: 'A', name: 'A', properties: {} };
const B: Node = { kind: 'symbol', id: 'B', name: 'B', properties: {} };

function edge(kind: Edge['kind'], sourceId: string, targetId: string, inferred = false): Edge {
  const base = { kind, sourceId, targetId, provenance: { pass: 'resolve', rule: 't' } } as const;
  return inferred
    ? { ...base, resolution: 'inferred', confidence: 'medium' }
    : { ...base, resolution: 'deterministic' };
}

const document: GraphDocument = {
  formatVersion: FORMAT_VERSION,
  nodes: [file, A, B],
  edges: [
    edge('contains', 'file', 'A'),
    edge('contains', 'file', 'B'),
    edge('calls', 'A', 'B'),
    edge('references', 'A', 'EXT', true),
    edge('calls', 'EXTSRC', 'A'),
  ],
};

/** Compact, order-independent view of a neighbor set for assertions. */
function summarize(neighbors: readonly Neighbor[]): Array<{
  kind: string;
  source: string;
  target: string;
  node: string | null;
}> {
  return neighbors
    .map((n) => ({
      kind: n.edge.kind,
      source: n.edge.sourceId,
      target: n.edge.targetId,
      node: n.node?.id ?? null,
    }))
    .sort((a, b) =>
      `${a.kind}${a.source}${a.target}`.localeCompare(`${b.kind}${b.source}${b.target}`),
    );
}

const backends = [
  { backend: 'sqlite' as const, skip: false },
  { backend: 'postgres' as const, skip: SKIP_POSTGRES },
];

for (const { backend, skip } of backends) {
  describe.skipIf(skip)(`KyselyGraphRepository neighbors [${backend}]`, () => {
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

    it('follows forward edges, with null for an external target', async () => {
      expect(summarize(await repository.neighbors('A', 'out'))).toEqual([
        { kind: 'calls', source: 'A', target: 'B', node: 'B' },
        { kind: 'references', source: 'A', target: 'EXT', node: null },
      ]);
    });

    it('follows reverse edges, with null for an external source', async () => {
      expect(summarize(await repository.neighbors('A', 'in'))).toEqual([
        { kind: 'calls', source: 'EXTSRC', target: 'A', node: null },
        { kind: 'contains', source: 'file', target: 'A', node: 'file' },
      ]);
    });

    it('filters by edge kind', async () => {
      expect(summarize(await repository.neighbors('A', 'out', 'calls'))).toEqual([
        { kind: 'calls', source: 'A', target: 'B', node: 'B' },
      ]);
    });

    it('resolves the reverse neighbours of B', async () => {
      expect(summarize(await repository.neighbors('B', 'in'))).toEqual([
        { kind: 'calls', source: 'A', target: 'B', node: 'A' },
        { kind: 'contains', source: 'file', target: 'B', node: 'file' },
      ]);
    });

    it('returns an empty list when a node has no edges in the direction', async () => {
      expect(await repository.neighbors('B', 'out')).toEqual([]);
    });
  });
}
