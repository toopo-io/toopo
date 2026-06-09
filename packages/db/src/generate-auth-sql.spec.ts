import { LibsqlDialect } from '@libsql/kysely-libsql';
import { describe, expect, it } from 'vitest';
import { compileAuthMigrationSql } from './generate-auth-sql.js';

describe('compileAuthMigrationSql', () => {
  it('compiles the four auth tables with the deletedAt extension (sqlite)', async () => {
    const sql = await compileAuthMigrationSql({
      dialect: new LibsqlDialect({ url: ':memory:' }),
      type: 'sqlite',
    });

    expect(sql).toContain('create table "user"');
    expect(sql).toContain('create table "session"');
    expect(sql).toContain('create table "account"');
    expect(sql).toContain('create table "verification"');
    // deletedAt comes from authSchemaOptions.additionalFields, not the canonical schema.
    expect(sql).toContain('"deletedAt"');
    expect(sql.endsWith('\n')).toBe(true);
  });
});
