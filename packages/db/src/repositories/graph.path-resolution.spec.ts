/**
 * ADR-0021 — per-hit blast-radius trust (`pathResolution`) on both backends, which
 * must agree EXACTLY. The fixture exercises every branch of the aggregation in a
 * single blastRadius(T):
 *
 *   D1 ─calls→ T        (deterministic)            → D1 proven       → deterministic
 *   I1 ─references→ T   (inferred)                 → I1 inferred-only → inferred
 *   I2 ─calls→ I1       (deterministic)            → I2 reaches T only via the
 *                                                    inferred I1→T edge → inferred
 *   M  ─references→ T   (inferred,   depth 1)      ┐ M reaches T by an inferred
 *   M  ─calls→ D1       (deterministic, depth 2)   ┘ direct edge AND a proven
 *                                                    2-hop chain (M→D1→T) → the
 *                                                    proven path wins → deterministic
 *
 * M also proves depth ⟂ pathResolution: its SHORTEST path (depth 1) is inferred,
 * yet a longer fully-deterministic path exists, so depth 1 coexists with
 * `deterministic` — proximity is never a trust claim (ADR-0015 §8, no false
 * certainty). `path_det` is integer multiply + `case`, identical on both backends.
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

function deterministic(kind: Edge['kind'], sourceId: string, targetId: string): Edge {
  return {
    kind,
    sourceId,
    targetId,
    resolution: 'deterministic',
    provenance: { pass: 'resolve', rule: 't' },
  };
}

function inferred(kind: Edge['kind'], sourceId: string, targetId: string): Edge {
  return {
    kind,
    sourceId,
    targetId,
    resolution: 'inferred',
    confidence: 'medium',
    provenance: { pass: 'resolve', rule: 't' },
  };
}

const document: GraphDocument = {
  formatVersion: FORMAT_VERSION,
  nodes: ['T', 'D1', 'I1', 'I2', 'M'].map(symbol),
  edges: [
    deterministic('calls', 'D1', 'T'),
    inferred('references', 'I1', 'T'),
    deterministic('calls', 'I2', 'I1'),
    inferred('references', 'M', 'T'),
    deterministic('calls', 'M', 'D1'),
  ],
};

/** Sort hits into a stable, comparable shape carrying depth + trust. */
function shape(
  hits: readonly BlastRadiusHit[],
): Array<{ nodeId: string; depth: number; pathResolution: string }> {
  return hits
    .map((h) => ({ nodeId: h.nodeId, depth: h.depth, pathResolution: h.pathResolution }))
    .sort((a, b) => a.nodeId.localeCompare(b.nodeId));
}

const backends = [
  { backend: 'sqlite' as const, skip: false },
  { backend: 'postgres' as const, skip: SKIP_POSTGRES },
];

// Captured per backend to assert cross-backend identity of pathResolution afterwards.
const radiusByBackend = new Map<
  string,
  Array<{ nodeId: string; depth: number; pathResolution: string }>
>();

for (const { backend, skip } of backends) {
  describe.skipIf(skip)(`KyselyGraphRepository pathResolution [${backend}]`, () => {
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

    it('marks a dependent reached by a fully-deterministic path as deterministic', async () => {
      const hits = shape(await repository.blastRadius('T'));
      const d1 = hits.find((h) => h.nodeId === 'D1');
      expect(d1).toEqual({ nodeId: 'D1', depth: 1, pathResolution: 'deterministic' });
    });

    it('marks an inferred-only dependent as inferred (direct and transitive)', async () => {
      const hits = shape(await repository.blastRadius('T'));
      // I1 depends on T through a single inferred edge.
      expect(hits.find((h) => h.nodeId === 'I1')).toEqual({
        nodeId: 'I1',
        depth: 1,
        pathResolution: 'inferred',
      });
      // I2 reaches T only via I1 — every path still traverses the inferred I1→T edge.
      expect(hits.find((h) => h.nodeId === 'I2')).toEqual({
        nodeId: 'I2',
        depth: 2,
        pathResolution: 'inferred',
      });
    });

    it('marks a mixed-path dependent deterministic — any proven chain wins', async () => {
      const hits = shape(await repository.blastRadius('T'));
      // M: shortest path is the inferred M→T edge (depth 1); a proven M→D1→T chain
      // also exists. Trust = any-proven-path, depth = min over all paths — independent.
      expect(hits.find((h) => h.nodeId === 'M')).toEqual({
        nodeId: 'M',
        depth: 1,
        pathResolution: 'deterministic',
      });
    });

    it('captures the full radius for cross-backend comparison', async () => {
      const hits = shape(await repository.blastRadius('T'));
      expect(hits).toEqual([
        { nodeId: 'D1', depth: 1, pathResolution: 'deterministic' },
        { nodeId: 'I1', depth: 1, pathResolution: 'inferred' },
        { nodeId: 'I2', depth: 2, pathResolution: 'inferred' },
        { nodeId: 'M', depth: 1, pathResolution: 'deterministic' },
      ]);
      radiusByBackend.set(backend, hits);
    });

    it('carries pathResolution through the hydrated, paginated view', async () => {
      const page = await repository.blastRadiusPage('T');
      const byId = new Map(page.items.map((h) => [h.nodeId, h.pathResolution]));
      expect(byId.get('D1')).toBe('deterministic');
      expect(byId.get('I1')).toBe('inferred');
      expect(byId.get('M')).toBe('deterministic');
    });
  });
}

describe('pathResolution cross-backend identity', () => {
  it.skipIf(SKIP_POSTGRES)('is identical on SQLite and Postgres', () => {
    expect(radiusByBackend.get('sqlite')).toEqual(radiusByBackend.get('postgres'));
  });
});
