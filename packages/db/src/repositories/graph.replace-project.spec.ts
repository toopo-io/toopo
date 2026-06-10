/**
 * B4.1 — replaceProjectGraph + getFileContentHashes on both backends (ADR-0025
 * Decisions 2 & 4). Proves the worker's persist contract: a full-project replace
 * reflects REMOVALS (deleted files, removed symbols) that the additive upsert
 * cannot, is atomic and idempotent, and never crosses project tenancy; and that
 * the stored per-file content hashes are read back keyed by path — the delta
 * authority the worker diffs the cloned tree against.
 */
import { FORMAT_VERSION, type GraphDocument, type Node } from '@toopo/core';
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
  name: '@toopo/app',
  version: '0.0.0',
  properties: {},
};

function fileNode(id: string, path: string, contentHash: string): Node {
  return { kind: 'file', id, path, contentHash, analysis: { status: 'analyzed' }, properties: {} };
}

function symbolNode(id: string, name: string): Node {
  return { kind: 'symbol', id, name, properties: {} };
}

function contains(sourceId: string, targetId: string): GraphDocument['edges'][number] {
  return {
    kind: 'contains',
    sourceId,
    targetId,
    resolution: 'deterministic',
    provenance: { pass: 'parse', rule: 'containment' },
  };
}

/** v1: two files (a.ts → sym:A, b.ts → sym:B). */
const docV1: GraphDocument = {
  formatVersion: FORMAT_VERSION,
  nodes: [
    repo,
    pkg,
    fileNode('file:a.ts', 'a.ts', 'sha256:aaa'),
    fileNode('file:b.ts', 'b.ts', 'sha256:bbb'),
    symbolNode('sym:A', 'A'),
    symbolNode('sym:B', 'B'),
  ],
  edges: [
    contains('repo', 'pkg'),
    contains('pkg', 'file:a.ts'),
    contains('pkg', 'file:b.ts'),
    contains('file:a.ts', 'sym:A'),
    contains('file:b.ts', 'sym:B'),
  ],
};

/** v2: b.ts removed; a.ts re-hashed and now declares sym:A + sym:C. */
const docV2: GraphDocument = {
  formatVersion: FORMAT_VERSION,
  nodes: [
    repo,
    pkg,
    fileNode('file:a.ts', 'a.ts', 'sha256:aaa2'),
    symbolNode('sym:A', 'A'),
    symbolNode('sym:C', 'C'),
  ],
  edges: [
    contains('repo', 'pkg'),
    contains('pkg', 'file:a.ts'),
    contains('file:a.ts', 'sym:A'),
    contains('file:a.ts', 'sym:C'),
  ],
};

async function tableCount(
  db: Kysely<GraphDatabase>,
  table: 'node' | 'edge',
  projectId: string,
): Promise<number> {
  const row = await db
    .selectFrom(table)
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .where('project_id', '=', projectId)
    .executeTakeFirstOrThrow();
  return Number(row.count);
}

const backends = [
  { backend: 'sqlite' as const, skip: false },
  { backend: 'postgres' as const, skip: SKIP_POSTGRES },
];

for (const { backend, skip } of backends) {
  describe.skipIf(skip)(`replaceProjectGraph + getFileContentHashes [${backend}]`, () => {
    const SCOPE = { projectId: 'proj-replace' };
    const OTHER = { projectId: 'proj-other' };
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

    it('returns an empty hash map for a project with no graph (full first scan)', async () => {
      expect(await repository.getFileContentHashes(SCOPE)).toEqual(new Map());
    });

    it('reports stored file hashes keyed by repo-relative path after persist', async () => {
      await repository.replaceProjectGraph(SCOPE, docV1);
      const hashes = await repository.getFileContentHashes(SCOPE);
      expect(hashes).toEqual(
        new Map([
          ['a.ts', 'sha256:aaa'],
          ['b.ts', 'sha256:bbb'],
        ]),
      );
    });

    it('replace reflects removals: deleted file and its symbol are gone', async () => {
      const result = await repository.replaceProjectGraph(SCOPE, docV2);
      expect(result).toEqual({ nodes: 5, edges: 4 });

      expect(await repository.getNode(SCOPE, 'file:b.ts')).toBeNull();
      expect(await repository.getNode(SCOPE, 'sym:B')).toBeNull();
      expect(await repository.getNode(SCOPE, 'sym:C')).not.toBeNull();

      const aFile = await repository.getNode(SCOPE, 'file:a.ts');
      expect(aFile?.kind === 'file' ? aFile.contentHash : null).toBe('sha256:aaa2');

      expect(await repository.getFileContentHashes(SCOPE)).toEqual(
        new Map([['a.ts', 'sha256:aaa2']]),
      );
    });

    it('is idempotent — re-replacing the same document leaves row counts unchanged', async () => {
      const before = {
        nodes: await tableCount(db, 'node', SCOPE.projectId),
        edges: await tableCount(db, 'edge', SCOPE.projectId),
      };
      const result = await repository.replaceProjectGraph(SCOPE, docV2);
      expect(result).toEqual({ nodes: 5, edges: 4 });
      expect(await tableCount(db, 'node', SCOPE.projectId)).toBe(before.nodes);
      expect(await tableCount(db, 'edge', SCOPE.projectId)).toBe(before.edges);
    });

    it('never crosses tenancy: replacing one project leaves another intact', async () => {
      await repository.replaceProjectGraph(OTHER, docV1);
      const otherBefore = await tableCount(db, 'node', OTHER.projectId);

      await repository.replaceProjectGraph(SCOPE, docV2);

      expect(await tableCount(db, 'node', OTHER.projectId)).toBe(otherBefore);
      expect(await repository.getNode(OTHER, 'file:b.ts')).not.toBeNull();
      expect(await repository.getFileContentHashes(OTHER)).toEqual(
        new Map([
          ['a.ts', 'sha256:aaa'],
          ['b.ts', 'sha256:bbb'],
        ]),
      );
    });
  });
}
