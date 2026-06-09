import { describe, expect, it } from 'vitest';
import { createDatabase } from './database.js';

describe('createDatabase', () => {
  it('builds a sqlite Kysely instance for :memory:', async () => {
    const { db, backend, type } = createDatabase({ databaseUrl: ':memory:' });
    expect(backend).toBe('sqlite');
    expect(type).toBe('sqlite');
    expect(typeof db.selectFrom).toBe('function');
    expect(typeof db.insertInto).toBe('function');
    expect(typeof db.transaction).toBe('function');
    await db.destroy();
  });

  it('builds a postgres Kysely instance without connecting', async () => {
    const { db, backend, type } = createDatabase({
      databaseUrl: 'postgres://user:pass@host:5432/db',
    });
    expect(backend).toBe('postgres');
    expect(type).toBe('postgres');
    expect(typeof db.selectFrom).toBe('function');
    await db.destroy();
  });

  it('throws when the config is invalid', () => {
    expect(() => createDatabase({ databaseUrl: 'mysql://host/db' })).toThrow();
    expect(() => createDatabase({})).toThrow();
  });
});
