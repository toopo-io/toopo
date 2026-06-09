import { LibsqlDialect } from '@libsql/kysely-libsql';
import { PostgresDialect } from 'kysely';
import { describe, expect, it } from 'vitest';
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
