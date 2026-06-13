/**
 * Regression: the map-view trust fold keys each projected (source, target)
 * container pair by `${src}${UNIT_SEPARATOR}${tgt}`. Without the separator, two
 * DISTINCT pairs whose ids concatenate equally — ("ab", "c") vs ("a", "bc"),
 * both "abc" — would fold into a single MapEdge. This pins the separator so the
 * two pairs stay distinct edges.
 *
 * The bug this guards is easy to reintroduce because the separator is U+001F, a
 * non-printing control character that is invisible in a plain source read.
 */
import { type Edge, FORMAT_VERSION, type GraphDocument, type Node } from '@toopo/core';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR } from '../migrations-dir.js';
import { migrateToLatest } from '../migrator.js';
import type { GraphDatabase } from '../schema/graph-types.js';
import { type BackendHarness, SKIP_POSTGRES, startBackend } from '../test-support/backends.js';
import { KyselyGraphRepository } from './graph.repository.kysely.js';

const repo: Node = { kind: 'repo', id: 'repo', name: 'repo', properties: {} };

function pkg(id: string): Node {
  return { kind: 'package', id, name: `@x/${id}`, properties: {} };
}
function file(id: string): Node {
  return {
    kind: 'file',
    id,
    path: `${id}.ts`,
    contentHash: id,
    analysis: { status: 'analyzed' },
    properties: {},
  };
}
function sym(id: string): Node {
  return { kind: 'symbol', id, name: id, properties: {} };
}
function depEdge(kind: 'contains' | 'imports', sourceId: string, targetId: string): Edge {
  return {
    kind,
    sourceId,
    targetId,
    resolution: 'deterministic',
    provenance: { pass: 'resolve', rule: 't' },
  };
}

// Package ids chosen so two distinct dependency pairs concatenate equally:
//   ("ab" → "c") and ("a" → "bc") both join to "abc" without a delimiter.
const document: GraphDocument = {
  formatVersion: FORMAT_VERSION,
  nodes: [
    repo,
    pkg('a'),
    pkg('ab'),
    pkg('bc'),
    pkg('c'),
    file('fa'),
    file('fab'),
    file('fbc'),
    file('fc'),
    sym('sa'),
    sym('sab'),
    sym('sbc'),
    sym('sc'),
  ],
  edges: [
    depEdge('contains', 'repo', 'a'),
    depEdge('contains', 'repo', 'ab'),
    depEdge('contains', 'repo', 'bc'),
    depEdge('contains', 'repo', 'c'),
    depEdge('contains', 'a', 'fa'),
    depEdge('contains', 'ab', 'fab'),
    depEdge('contains', 'bc', 'fbc'),
    depEdge('contains', 'c', 'fc'),
    depEdge('contains', 'fa', 'sa'),
    depEdge('contains', 'fab', 'sab'),
    depEdge('contains', 'fbc', 'sbc'),
    depEdge('contains', 'fc', 'sc'),
    // The two cross-package dependencies whose package pairs concat-collide.
    depEdge('imports', 'sab', 'sc'), // → package pair (ab, c)
    depEdge('imports', 'sa', 'sbc'), // → package pair (a, bc)
  ],
};

const SCOPE = { projectId: 'proj-collision' };

const backends = [
  { backend: 'sqlite' as const, skip: false },
  { backend: 'postgres' as const, skip: SKIP_POSTGRES },
];

for (const { backend, skip } of backends) {
  describe.skipIf(skip)(`map-view pair-key collision [${backend}]`, () => {
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

    it('keeps concat-colliding (source, target) pairs as distinct edges', async () => {
      const view = await repository.mapView(SCOPE, { level: 'package' });
      const edges = view.edges
        .map((e) => ({
          sourceId: e.sourceId,
          targetId: e.targetId,
          deterministic: e.deterministic,
          inferred: e.inferred,
        }))
        .sort(
          (a, b) => a.sourceId.localeCompare(b.sourceId) || a.targetId.localeCompare(b.targetId),
        );
      // Without the U+001F key separator both pairs hash to "abc" and fold into
      // ONE edge (deterministic: 2); the separator keeps them two distinct edges.
      expect(edges).toEqual([
        { sourceId: 'a', targetId: 'bc', deterministic: 1, inferred: 0 },
        { sourceId: 'ab', targetId: 'c', deterministic: 1, inferred: 0 },
      ]);
    });
  });
}
