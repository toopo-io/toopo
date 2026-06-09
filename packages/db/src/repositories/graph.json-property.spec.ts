/**
 * S6 — the `->>` JSON-property contract lock (ADR-0017 §6). Persists nodes whose
 * open `properties` carry STRING values, then extracts and filters by them with
 * `->>` on both backends, asserting identical text results. This freezes the one
 * portable JSON operator before Serve's property-filtered queries depend on it.
 *
 * Scope note: `->>` is portable for STRING values (text on both libSQL and
 * Postgres). It is NOT portable for JSON booleans/numbers (SQLite yields the SQL
 * scalar, Postgres yields text), so the deterministic graph filters on string
 * properties only — exactly what this test pins.
 */
import { FORMAT_VERSION, type GraphDocument, type Node } from '@toopo/core';
import { type Kysely, sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR } from '../migrations-dir.js';
import { migrateToLatest } from '../migrator.js';
import type { GraphDatabase } from '../schema/graph-types.js';
import { type BackendHarness, SKIP_POSTGRES, startBackend } from '../test-support/backends.js';
import { KyselyGraphRepository } from './graph.repository.kysely.js';

const spicy: Node = {
  kind: 'symbol',
  id: 'sym:spicy',
  name: 'spicy',
  properties: { flavor: 'spicy', origin: 'sichuan' },
};
const mild: Node = {
  kind: 'symbol',
  id: 'sym:mild',
  name: 'mild',
  properties: { flavor: 'mild', origin: 'kyoto' },
};

const document: GraphDocument = {
  formatVersion: FORMAT_VERSION,
  nodes: [spicy, mild],
  edges: [],
};

const backends = [
  { backend: 'sqlite' as const, skip: false },
  { backend: 'postgres' as const, skip: SKIP_POSTGRES },
];

for (const { backend, skip } of backends) {
  describe.skipIf(skip)(`json ->> property access [${backend}]`, () => {
    let harness: BackendHarness;
    let db: Kysely<GraphDatabase>;

    beforeAll(async () => {
      harness = await startBackend(backend);
      db = harness.db as unknown as Kysely<GraphDatabase>;
      await migrateToLatest({ db: harness.db, backend, rootDir: MIGRATIONS_DIR });
      await new KyselyGraphRepository(db).persistGraph(document);
    }, 120_000);

    afterAll(async () => {
      await harness?.cleanup();
    });

    it('extracts a string property as identical text via ->>', async () => {
      const rows = await sql<{ id: string; flavor: string }>`
        select "id", "properties" ->> 'flavor' as "flavor"
        from "node"
        order by "id"
      `.execute(db);
      expect(rows.rows).toEqual([
        { id: 'sym:mild', flavor: 'mild' },
        { id: 'sym:spicy', flavor: 'spicy' },
      ]);
    });

    it('filters rows by a ->> string predicate', async () => {
      const rows = await sql<{ id: string }>`
        select "id" from "node" where "properties" ->> 'flavor' = ${'spicy'}
      `.execute(db);
      expect(rows.rows).toEqual([{ id: 'sym:spicy' }]);
    });

    it('returns null for an absent property key', async () => {
      const row = await sql<{ missing: string | null }>`
        select "properties" ->> 'nope' as "missing" from "node" where "id" = ${'sym:spicy'}
      `.execute(db);
      expect(row.rows[0]?.missing ?? null).toBeNull();
    });
  });
}
