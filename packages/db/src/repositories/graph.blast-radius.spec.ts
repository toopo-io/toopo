/**
 * S5 — blastRadius on both backends. The two backends must return IDENTICAL
 * results. Covers: transitive reverse-reachability with shortest depth, the
 * depth cap, a cycle (terminates and reports each node once), the kind filter
 * (contains excluded by default), a diamond (a node reachable by two paths is
 * still one hit), and the U+001F separator guard.
 *
 * Dependency chain (edges point the way a dependency is declared; blast-radius
 * walks them backwards):
 *   D ─calls→ C ─calls→ B ─calls→ A         (A is depended on by B, C, D)
 *   E ─calls→ B  and  E ─calls→ C           (diamond into the chain)
 *   A ─calls→ D                             (cycle A→D→C→B→A)
 *   F ─contains→ A                          (structure — excluded by default)
 */
import { type Edge, FORMAT_VERSION, type GraphDocument, type Node } from '@toopo/core';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR } from '../migrations-dir.js';
import { migrateToLatest } from '../migrator.js';
import type { GraphDatabase } from '../schema/graph-types.js';
import { type BackendHarness, SKIP_POSTGRES, startBackend } from '../test-support/backends.js';
import type { BlastRadiusHit } from './graph.repository.js';
import { KyselyGraphRepository } from './graph.repository.kysely.js';

function symbol(id: string): Node {
  return { kind: 'symbol', id, name: id, properties: {} };
}

function calls(sourceId: string, targetId: string): Edge {
  return {
    kind: 'calls',
    sourceId,
    targetId,
    resolution: 'deterministic',
    provenance: { pass: 'resolve', rule: 'call' },
  };
}

const file: Node = {
  kind: 'file',
  id: 'F',
  path: 'f.ts',
  contentHash: 'h',
  analysis: { status: 'analyzed' },
  properties: {},
};

const document: GraphDocument = {
  formatVersion: FORMAT_VERSION,
  nodes: ['A', 'B', 'C', 'D', 'E'].map(symbol).concat(file),
  edges: [
    calls('B', 'A'),
    calls('C', 'B'),
    calls('D', 'C'),
    calls('E', 'B'),
    calls('E', 'C'),
    calls('A', 'D'), // closes the cycle A -> D -> C -> B -> A
    {
      kind: 'contains',
      sourceId: 'F',
      targetId: 'A',
      resolution: 'deterministic',
      provenance: { pass: 'parse', rule: 'containment' },
    },
  ],
};

/** Sort hits into a stable, comparable shape. */
function shape(hits: readonly BlastRadiusHit[]): Array<{ nodeId: string; depth: number }> {
  return hits
    .map((h) => ({ nodeId: h.nodeId, depth: h.depth }))
    .sort((a, b) => a.nodeId.localeCompare(b.nodeId));
}

const SCOPE = { projectId: 'proj-blast' };

const backends = [
  { backend: 'sqlite' as const, skip: false },
  { backend: 'postgres' as const, skip: SKIP_POSTGRES },
];

// Captured from each backend to assert cross-backend identity afterwards.
const fullRadiusByBackend = new Map<string, Array<{ nodeId: string; depth: number }>>();

for (const { backend, skip } of backends) {
  describe.skipIf(skip)(`KyselyGraphRepository blastRadius [${backend}]`, () => {
    let harness: BackendHarness;
    let repository: KyselyGraphRepository;

    beforeAll(async () => {
      harness = await startBackend(backend);
      const db = harness.db as unknown as Kysely<GraphDatabase>;
      await migrateToLatest({ db: harness.db, backend, rootDir: MIGRATIONS_DIR });
      repository = new KyselyGraphRepository(db);
      await repository.persistGraph(SCOPE, document);
    }, 120_000);

    afterAll(async () => {
      await harness?.cleanup();
    });

    it('reports every transitive dependent with its shortest depth', async () => {
      const hits = shape(await repository.blastRadius(SCOPE, 'A'));
      // B depends on A (1); C and E reach A at depth 2 (E via B); D at depth 3.
      expect(hits).toEqual([
        { nodeId: 'B', depth: 1 },
        { nodeId: 'C', depth: 2 },
        { nodeId: 'D', depth: 3 },
        { nodeId: 'E', depth: 2 },
      ]);
      fullRadiusByBackend.set(backend, hits);
    });

    it('never includes the queried node itself', async () => {
      const hits = await repository.blastRadius(SCOPE, 'A');
      expect(hits.some((h) => h.nodeId === 'A')).toBe(false);
    });

    it('marks every hit deterministic when all paths are deterministic', async () => {
      // The whole fixture is deterministic `calls` edges, so every dependent is
      // reached by a proven chain — none may be reported as inferred (ADR-0021).
      const hits = await repository.blastRadius(SCOPE, 'A');
      expect(hits.every((h) => h.pathResolution === 'deterministic')).toBe(true);
    });

    it('honours the depth cap', async () => {
      const hits = shape(await repository.blastRadius(SCOPE, 'A', { maxDepth: 1 }));
      expect(hits).toEqual([{ nodeId: 'B', depth: 1 }]);
    });

    it('terminates on a cycle and reports each node once', async () => {
      // From B the cycle is B<-C<-D<-A<-B; every other node is reachable exactly once.
      const hits = shape(await repository.blastRadius(SCOPE, 'B', { maxDepth: 100 }));
      expect(hits.map((h) => h.nodeId)).toEqual(['A', 'C', 'D', 'E']);
    });

    it('excludes contains by default but can traverse an explicit kind set', async () => {
      const byDefault = await repository.blastRadius(SCOPE, 'A');
      expect(byDefault.some((h) => h.nodeId === 'F')).toBe(false);
      const withContains = await repository.blastRadius(SCOPE, 'A', {
        kinds: ['calls', 'contains'],
      });
      expect(withContains.some((h) => h.nodeId === 'F')).toBe(true);
    });

    it('returns empty for a leaf, an unknown id, and a non-positive depth', async () => {
      // E is a true leaf: nothing depends on it (it only calls B and C).
      expect(await repository.blastRadius(SCOPE, 'E')).toEqual([]);
      expect(await repository.blastRadius(SCOPE, 'nope')).toEqual([]);
      expect(await repository.blastRadius(SCOPE, 'A', { maxDepth: 0 })).toEqual([]);
      expect(await repository.blastRadius(SCOPE, 'A', { kinds: [] })).toEqual([]);
    });

    it('rejects an id containing the U+001F path separator', async () => {
      await expect(repository.blastRadius(SCOPE, `x${String.fromCharCode(31)}y`)).rejects.toThrow(
        /U\+001F/,
      );
    });
  });
}

describe('blastRadius cross-backend identity', () => {
  it.skipIf(SKIP_POSTGRES)('returns identical results on SQLite and Postgres', () => {
    expect(fullRadiusByBackend.get('sqlite')).toEqual(fullRadiusByBackend.get('postgres'));
  });
});
