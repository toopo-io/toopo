import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from './database.js';
import { MIGRATIONS_DIR } from './migrations-dir.js';
import { migrateToLatest, splitSqlStatements } from './migrator.js';
import { type BackendHarness, SKIP_POSTGRES, startBackend } from './test-support/backends.js';

describe('migrateToLatest error handling', () => {
  it('throws with the failing migration name and ignores non-sql files', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'toopo-mig-'));
    const dir = path.join(root, 'sqlite');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, '0000_bad.sql'), 'create table ("oops";', 'utf8');
    await writeFile(path.join(dir, 'notes.txt'), 'ignored by the .sql filter', 'utf8');

    const { db } = createDatabase({ databaseUrl: ':memory:' });
    try {
      await expect(migrateToLatest({ db, backend: 'sqlite', rootDir: root })).rejects.toThrow(
        /Database migration failed.*0000_bad/,
      );
    } finally {
      await db.destroy();
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('splitSqlStatements', () => {
  it('splits on semicolons and trims, dropping empties', () => {
    expect(splitSqlStatements('create table a (x);\n\ncreate index i on a (x);\n')).toEqual([
      'create table a (x)',
      'create index i on a (x)',
    ]);
  });

  it('returns an empty list for whitespace-only input', () => {
    expect(splitSqlStatements('   \n  ;  ')).toEqual([]);
  });

  it('ignores semicolons inside -- line comments (full-line and trailing)', () => {
    const sql = [
      '-- a comment; with a semicolon that must not split',
      'create table t (x);',
      'create index i on t (x); -- trailing; note',
      '-- closing; note',
    ].join('\n');
    expect(splitSqlStatements(sql)).toEqual(['create table t (x)', 'create index i on t (x)']);
  });
});

const AUTH_TABLES = ['user', 'session', 'account', 'verification'] as const;
const DELETED_AT_INDEX = 'user_deletedAt_idx';

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
  describe.skipIf(skip)(`migrateToLatest [${backend}]`, () => {
    let harness: BackendHarness;

    beforeAll(async () => {
      harness = await startBackend(backend);
    }, 120_000);

    afterAll(async () => {
      await harness?.cleanup();
    });

    it('applies the auth, graph, and project migrations in order', async () => {
      const results = await migrateToLatest({
        db: harness.db,
        backend: harness.backend,
        rootDir: MIGRATIONS_DIR,
      });
      expect(results.map((r) => r.migrationName)).toEqual([
        '0000_better_auth',
        '0001_user_deleted_at_idx',
        '0002_graph',
        '0003_graph_callsite_idx',
        '0004_project',
        '0005_graph_project_scope',
      ]);
      expect(results.every((r) => r.status === 'Success')).toBe(true);
    });

    it('creates the four auth tables with a deletedAt column on user', async () => {
      const tables = await harness.db.introspection.getTables();
      const names = tables.map((t) => t.name);
      for (const table of AUTH_TABLES) {
        expect(names).toContain(table);
      }
      const userTable = tables.find((t) => t.name === 'user');
      expect(userTable?.columns.map((c) => c.name)).toContain('deletedAt');
    });

    it('creates the deletedAt index (ADR-0013)', async () => {
      expect(await indexExists(harness, DELETED_AT_INDEX)).toBe(true);
    });

    it('is idempotent — a second run applies nothing', async () => {
      const results = await migrateToLatest({
        db: harness.db,
        backend: harness.backend,
        rootDir: MIGRATIONS_DIR,
      });
      expect(results).toEqual([]);
    });
  });
}
