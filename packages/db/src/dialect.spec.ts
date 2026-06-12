import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LibsqlDialect } from '@libsql/kysely-libsql';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { afterEach, describe, expect, it } from 'vitest';
import { buildDialect } from './dialect.js';

describe('buildDialect', () => {
  it('builds a PostgresDialect for a postgres url without connecting', () => {
    const resolved = buildDialect('postgres://user:pass@host:5432/db');
    expect(resolved.backend).toBe('postgres');
    expect(resolved.type).toBe('postgres');
    expect(resolved.dialect).toBeInstanceOf(PostgresDialect);
  });

  it('builds a LibsqlDialect for an in-memory sqlite url', () => {
    const resolved = buildDialect(':memory:');
    expect(resolved.backend).toBe('sqlite');
    expect(resolved.type).toBe('sqlite');
    expect(resolved.dialect).toBeInstanceOf(LibsqlDialect);
  });

  it('builds a LibsqlDialect for a file url', () => {
    const resolved = buildDialect('file:./toopo.db');
    expect(resolved.backend).toBe('sqlite');
    expect(resolved.dialect).toBeInstanceOf(LibsqlDialect);
  });

  it('throws on an unrecognized scheme', () => {
    expect(() => buildDialect('mysql://host/db')).toThrow(/unrecognized DATABASE_URL scheme/);
  });
});

describe('sqlite resilience pragmas (ADR-0030 §4)', () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) {
      await cleanup();
    }
  });

  it('enables WAL journal mode and sets busy_timeout on a file database', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'toopo-db-resilience-'));
    // libSQL parses `file:` URLs with forward slashes (mirrors the dev config).
    const databaseUrl = `file:${join(dir, 'resilience.db').replace(/\\/g, '/')}`;
    const { dialect } = buildDialect(databaseUrl);
    const db = new Kysely<Record<string, never>>({ dialect });
    cleanups.push(async () => {
      await db.destroy();
      // Best-effort temp cleanup: libSQL's native handle can hold a Windows file
      // lock past close, so the unlink may EBUSY. That race is not under test
      // (the pragmas are already asserted) and the OS reclaims its temp dir, so a
      // single failed attempt is ignored rather than retried (retry backoff would
      // block teardown) or surfaced as a test failure.
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    });

    const journal = await sql`PRAGMA journal_mode`.execute(db);
    expect((journal.rows[0] as { journal_mode: string }).journal_mode).toBe('wal');

    const busy = await sql`PRAGMA busy_timeout`.execute(db);
    expect((busy.rows[0] as { timeout: number }).timeout).toBe(5000);
  });
});
