/**
 * S1 — the graph schema migrates up identically on both backends (ADR-0017 §5,
 * §6). Asserts the committed `0002_graph.sql` creates the `node` and `edge`
 * tables with their structural columns and the forward/reverse traversal
 * indexes, on libSQL-SQLite and Postgres alike.
 */
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR } from '../migrations-dir.js';
import { migrateToLatest } from '../migrator.js';
import { type BackendHarness, SKIP_POSTGRES, startBackend } from '../test-support/backends.js';

const NODE_COLUMNS = [
  'project_id',
  'id',
  'kind',
  'sub_kind',
  'name',
  'path',
  'content_hash',
  'version',
  'enclosing_symbol_id',
  'callee',
  'ordinal',
  'analysis_status',
  'analysis_reason',
  'file_id',
  'location',
  'payload',
  'properties',
] as const;

const EDGE_COLUMNS = [
  'project_id',
  'edge_key',
  'source_id',
  'target_id',
  'kind',
  'sub_kind',
  'resolution',
  'confidence',
  'provenance_pass',
  'provenance_rule',
  'file_id',
] as const;

const GRAPH_INDEXES = [
  'node_kind_idx',
  'node_sub_kind_idx',
  'node_content_hash_idx',
  'node_file_id_idx',
  // ADR-0020 A1: the call-site lookup index for the Serve node-detail zoom-in
  // (call-sites of a symbol, queried by enclosing_symbol_id).
  'node_enclosing_symbol_id_idx',
  'edge_source_idx',
  'edge_target_idx',
  'edge_file_id_idx',
] as const;

async function indexExists(harness: BackendHarness, name: string): Promise<boolean> {
  if (harness.backend === 'sqlite') {
    const result = await sql<{ name: string }>`
      select name from sqlite_master where type = 'index' and name = ${name}
    `.execute(harness.db);
    return result.rows.length > 0;
  }
  const result = await sql<{ indexname: string }>`
    select indexname from pg_indexes where indexname = ${name}
  `.execute(harness.db);
  return result.rows.length > 0;
}

const backends = [
  { backend: 'sqlite' as const, skip: false },
  { backend: 'postgres' as const, skip: SKIP_POSTGRES },
];

for (const { backend, skip } of backends) {
  describe.skipIf(skip)(`graph schema [${backend}]`, () => {
    let harness: BackendHarness;

    beforeAll(async () => {
      harness = await startBackend(backend);
      await migrateToLatest({ db: harness.db, backend, rootDir: MIGRATIONS_DIR });
    }, 120_000);

    afterAll(async () => {
      await harness?.cleanup();
    });

    it('creates the node table with all structural columns', async () => {
      const tables = await harness.db.introspection.getTables();
      const node = tables.find((t) => t.name === 'node');
      expect(node).toBeDefined();
      const columns = node?.columns.map((c) => c.name) ?? [];
      for (const column of NODE_COLUMNS) {
        expect(columns).toContain(column);
      }
    });

    it('creates the edge table with all structural columns', async () => {
      const tables = await harness.db.introspection.getTables();
      const edge = tables.find((t) => t.name === 'edge');
      expect(edge).toBeDefined();
      const columns = edge?.columns.map((c) => c.name) ?? [];
      for (const column of EDGE_COLUMNS) {
        expect(columns).toContain(column);
      }
    });

    it('creates the forward and reverse traversal indexes', async () => {
      for (const index of GRAPH_INDEXES) {
        expect(await indexExists(harness, index)).toBe(true);
      }
    });
  });
}
