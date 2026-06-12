/**
 * ADR-0016 amendment / C11 — the persisted honest tail of the Resolve pass on
 * both backends: an import/usage that could not be bound to a precise symbol,
 * stored as a project-scoped sibling of the graph (never a fabricated edge) so a
 * later "unused"/"cycle" view can ask "does this file have an unresolved inbound
 * usage?" and never read a resolution gap as genuine absence.
 *
 * Covers: persist + keyset-paged list, the `targetFileId` honesty filter,
 * stored-once idempotency, full-replace semantics (incl. clearing), determinism,
 * and project scoping.
 */
import { FORMAT_VERSION, type GraphDocument, type UnresolvedReference } from '@toopo/core';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR } from '../migrations-dir.js';
import { migrateToLatest } from '../migrator.js';
import type { GraphDatabase } from '../schema/graph-types.js';
import { type BackendHarness, SKIP_POSTGRES, startBackend } from '../test-support/backends.js';
import { KyselyGraphRepository } from './graph.repository.kysely.js';
import type { Page } from './graph-page.js';

const EMPTY: GraphDocument = { formatVersion: FORMAT_VERSION, nodes: [], edges: [] };

/** Two export gaps (module resolved, export did not) and one module gap. */
const exportGapToB: UnresolvedReference = {
  code: 'unresolved-export',
  importerFileId: 'fileA',
  specifier: './b',
  targetFileId: 'fileB',
  name: 'Ghost',
  message: 'no export Ghost in ./b',
};
const ambiguousExportToB: UnresolvedReference = {
  code: 'ambiguous-export',
  importerFileId: 'fileC',
  specifier: './b',
  targetFileId: 'fileB',
  name: 'Dup',
  message: 'ambiguous export Dup',
};
const moduleGap: UnresolvedReference = {
  code: 'unresolved-module',
  importerFileId: 'fileA',
  specifier: './missing',
  message: 'no file for ./missing',
};
const references: readonly UnresolvedReference[] = [exportGapToB, moduleGap, ambiguousExportToB];

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

const SCOPE = { projectId: 'proj-unresolved' };

const backends = [
  { backend: 'sqlite' as const, skip: false },
  { backend: 'postgres' as const, skip: SKIP_POSTGRES },
];

for (const { backend, skip } of backends) {
  describe.skipIf(skip)(`Unresolved references [${backend}]`, () => {
    let harness: BackendHarness;
    let repository: KyselyGraphRepository;

    beforeAll(async () => {
      harness = await startBackend(backend);
      const db = harness.db as unknown as Kysely<GraphDatabase>;
      await migrateToLatest({ db: harness.db, backend, rootDir: MIGRATIONS_DIR });
      repository = new KyselyGraphRepository(db);
      await repository.replaceProjectGraph(SCOPE, EMPTY, references);
    }, 120_000);

    afterAll(async () => {
      await harness?.cleanup();
    });

    it('lists every persisted reference across small pages, deterministically', async () => {
      const all = await drain((cursor) =>
        repository.unresolvedReferences(SCOPE, { limit: 1, cursor }),
      );
      expect(all).toHaveLength(3);
      expect(new Set(all.map((r) => r.message))).toEqual(
        new Set([exportGapToB.message, moduleGap.message, ambiguousExportToB.message]),
      );
      // A second drain returns byte-identical results (deterministic order).
      const again = await drain((cursor) =>
        repository.unresolvedReferences(SCOPE, { limit: 1, cursor }),
      );
      expect(JSON.stringify(again)).toBe(JSON.stringify(all));
    });

    it('answers the honesty query: references whose resolved target is a given file', async () => {
      const toB = await drain((cursor) =>
        repository.unresolvedReferences(SCOPE, { targetFileId: 'fileB', cursor }),
      );
      expect(toB.map((r) => r.name).sort()).toEqual(['Dup', 'Ghost']);
      expect(toB.every((r) => r.targetFileId === 'fileB')).toBe(true);
      // A module gap carries no target, so it is never attributed to a file.
      const toMissing = await repository.unresolvedReferences(SCOPE, { targetFileId: 'fileA' });
      expect(toMissing.items).toEqual([]);
    });

    it('is stored-once: replacing with the same set leaves the count unchanged', async () => {
      await repository.replaceProjectGraph(SCOPE, EMPTY, references);
      const all = await drain((cursor) => repository.unresolvedReferences(SCOPE, { cursor }));
      expect(all).toHaveLength(3);
    });

    it('full-replace reflects removals, and an empty set clears the tail', async () => {
      const scope = { projectId: 'proj-unresolved-replace' };
      await repository.replaceProjectGraph(scope, EMPTY, references);
      expect(
        await drain((c) => repository.unresolvedReferences(scope, { cursor: c })),
      ).toHaveLength(3);

      // Re-resolve drops two and keeps one — the persisted tail must follow.
      await repository.replaceProjectGraph(scope, EMPTY, [exportGapToB]);
      const after = await drain((c) => repository.unresolvedReferences(scope, { cursor: c }));
      expect(after.map((r) => r.name)).toEqual(['Ghost']);

      // No unresolved references at all clears the tail entirely.
      await repository.replaceProjectGraph(scope, EMPTY, []);
      expect(await drain((c) => repository.unresolvedReferences(scope, { cursor: c }))).toEqual([]);
    });

    it('scopes references by project — another project tail never leaks in', async () => {
      const other = { projectId: 'proj-unresolved-other' };
      await repository.replaceProjectGraph(other, EMPTY, [moduleGap]);
      const here = await drain((c) => repository.unresolvedReferences(SCOPE, { cursor: c }));
      expect(here).toHaveLength(3);
      const there = await repository.unresolvedReferences(other);
      expect(there.items).toHaveLength(1);
    });

    it('round-trips call-site usage gaps and answers the honesty query for a member usage (C11)', async () => {
      const scope = { projectId: 'proj-unresolved-usage' };
      // An ANCHORED member usage (`Form.Item` on a value import resolved to fileB) and
      // an ANCHORLESS callee (`handler.run`, root unresolved — name only, no target).
      const memberGapToB: UnresolvedReference = {
        code: 'unresolved-member',
        importerFileId: 'fileA',
        specifier: 'Form.Item',
        targetFileId: 'fileB',
        name: 'Item',
        message: 'Unresolved member "Item" on "Form.Item"',
      };
      const unboundCallee: UnresolvedReference = {
        code: 'unbound-callee',
        importerFileId: 'fileA',
        specifier: 'handler.run',
        name: 'run',
        message: 'Unbound callee root for member "run" on "handler.run"',
      };
      await repository.replaceProjectGraph(scope, EMPTY, [memberGapToB, unboundCallee]);

      const all = await drain((c) => repository.unresolvedReferences(scope, { cursor: c }));
      expect(all).toEqual(expect.arrayContaining([memberGapToB, unboundCallee]));
      expect(all).toHaveLength(2);

      // The honesty query attributes the anchored member usage to fileB; the
      // anchorless callee carries no target, so it is never attributed to a file.
      const toB = await drain((c) =>
        repository.unresolvedReferences(scope, { targetFileId: 'fileB', cursor: c }),
      );
      expect(toB).toEqual([memberGapToB]);
    });

    it('is stored-once for collapsed usage identity (same file/code/callee/member)', async () => {
      const scope = { projectId: 'proj-unresolved-usage-collapse' };
      const gap: UnresolvedReference = {
        code: 'unresolved-member',
        importerFileId: 'fileA',
        specifier: 'Form.Item',
        targetFileId: 'fileB',
        name: 'Item',
        message: 'Unresolved member "Item" on "Form.Item"',
      };
      // Two structurally identical usages (two `Form.Item` call-sites in one file)
      // collapse to one persisted row by ref_key — stored-once (ADR-0015 §11).
      await repository.replaceProjectGraph(scope, EMPTY, [gap, { ...gap }]);
      const all = await drain((c) => repository.unresolvedReferences(scope, { cursor: c }));
      expect(all).toEqual([gap]);
    });
  });
}
