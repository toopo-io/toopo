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

  it('compiles the organization (Workspace) tenancy tables from the plugin (sqlite)', async () => {
    const sql = await compileAuthMigrationSql({
      dialect: new LibsqlDialect({ url: ':memory:' }),
      type: 'sqlite',
    });

    // ADR-0028: the organization plugin is the single schema source for the
    // Workspace tenancy substrate, shared with the runtime factory.
    expect(sql).toContain('create table "organization"');
    expect(sql).toContain('create table "member"');
    expect(sql).toContain('create table "invitation"');
    // The plugin augments the session with the active workspace pointer.
    expect(sql).toContain('"activeOrganizationId"');
  });
});
