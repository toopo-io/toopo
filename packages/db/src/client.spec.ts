import { describe, expect, it, vi } from 'vitest';

vi.mock('@neondatabase/serverless', () => {
  class FakePool {
    public readonly config: { connectionString?: string };
    constructor(config: { connectionString?: string }) {
      this.config = config;
    }
  }
  return { Pool: FakePool };
});

import { createDb } from './client.js';

describe('createDb', () => {
  it('throws when databaseUrl is empty', () => {
    expect(() => createDb({ databaseUrl: '' })).toThrow(/must not be empty/);
  });

  it('throws when databaseUrl is whitespace only', () => {
    expect(() => createDb({ databaseUrl: '   ' })).toThrow(/must not be empty/);
  });

  it('returns a Drizzle instance exposing the query-builder surface', () => {
    const db = createDb({
      databaseUrl: 'postgresql://user:pass@host/db?sslmode=require',
    });
    expect(typeof db.select).toBe('function');
    expect(typeof db.insert).toBe('function');
    expect(typeof db.update).toBe('function');
    expect(typeof db.delete).toBe('function');
    expect(typeof db.transaction).toBe('function');
  });
});
