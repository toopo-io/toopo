import { describe, expect, it } from 'vitest';
import { inferBackend, parseDatabaseConfig, resolveBackend } from './config.js';

describe('inferBackend', () => {
  it.each([
    ['postgres://user:pass@host/db', 'postgres'],
    ['postgresql://user:pass@host/db?sslmode=require', 'postgres'],
    ['libsql://my-db.turso.io', 'sqlite'],
    ['sqlite://./local.db', 'sqlite'],
    ['file:./toopo.db', 'sqlite'],
    [':memory:', 'sqlite'],
  ] as const)('maps %s -> %s', (url, expected) => {
    expect(inferBackend(url)).toBe(expected);
  });

  it('trims surrounding whitespace before matching', () => {
    expect(inferBackend('  postgres://host/db  ')).toBe('postgres');
  });

  it('returns null for an unknown scheme', () => {
    expect(inferBackend('mysql://host/db')).toBeNull();
    expect(inferBackend('not-a-url')).toBeNull();
    expect(inferBackend('')).toBeNull();
  });
});

describe('parseDatabaseConfig', () => {
  it('accepts and trims a valid postgres url', () => {
    const config = parseDatabaseConfig({ databaseUrl: '  postgres://host/db  ' });
    expect(config.databaseUrl).toBe('postgres://host/db');
  });

  it('accepts a libSQL file url', () => {
    expect(parseDatabaseConfig({ databaseUrl: 'file:./toopo.db' }).databaseUrl).toBe(
      'file:./toopo.db',
    );
  });

  it('rejects an empty url', () => {
    expect(() => parseDatabaseConfig({ databaseUrl: '   ' })).toThrow();
  });

  it('rejects an unknown scheme', () => {
    expect(() => parseDatabaseConfig({ databaseUrl: 'mysql://host/db' })).toThrow(/known scheme/);
  });

  it('rejects a missing databaseUrl', () => {
    expect(() => parseDatabaseConfig({})).toThrow();
  });
});

describe('resolveBackend', () => {
  it('resolves postgres and sqlite from a validated config', () => {
    expect(resolveBackend({ databaseUrl: 'postgres://host/db' })).toBe('postgres');
    expect(resolveBackend({ databaseUrl: ':memory:' })).toBe('sqlite');
  });
});
