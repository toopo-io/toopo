/**
 * ADR-0020 Phase D — worker CLI argument parsing. Pure unit tests: the
 * positional directory (with optional `ingest` subcommand), the database URL
 * from flag or env, the gitignore flag, and the required-argument errors.
 */
import { describe, expect, it } from 'vitest';
import { parseArgs } from './args.js';

describe('parseArgs', () => {
  it('parses a directory and --database-url', () => {
    expect(parseArgs(['./repo', '--database-url', 'file:graph.db'])).toEqual({
      rootDir: './repo',
      databaseUrl: 'file:graph.db',
      gitignore: true,
    });
  });

  it('accepts the optional `ingest` subcommand', () => {
    const parsed = parseArgs(['ingest', './repo', '--database-url', 'file:g.db']);
    expect(parsed.rootDir).toBe('./repo');
  });

  it('falls back to DATABASE_URL from the env', () => {
    const parsed = parseArgs(['./repo'], { DATABASE_URL: 'postgres://x/y' });
    expect(parsed.databaseUrl).toBe('postgres://x/y');
  });

  it('prefers the explicit flag over the env', () => {
    const parsed = parseArgs(['./repo', '--database-url', 'file:a.db'], {
      DATABASE_URL: 'file:b.db',
    });
    expect(parsed.databaseUrl).toBe('file:a.db');
  });

  it('honors --no-gitignore', () => {
    expect(parseArgs(['./repo', '--database-url', 'file:g.db', '--no-gitignore']).gitignore).toBe(
      false,
    );
  });

  it('throws when the directory is missing', () => {
    expect(() => parseArgs(['--database-url', 'file:g.db'])).toThrow(/Usage/);
  });

  it('throws when no database URL is given', () => {
    expect(() => parseArgs(['./repo'])).toThrow(/database URL is required/);
  });
});
