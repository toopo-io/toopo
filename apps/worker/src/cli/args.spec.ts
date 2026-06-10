/**
 * ADR-0020 Phase D — worker CLI argument parsing. Pure unit tests: the
 * positional directory (with optional `ingest` subcommand), the database URL
 * from flag or env, the gitignore flag, and the required-argument errors.
 */
import { describe, expect, it } from 'vitest';
import { parseArgs } from './args.js';

const REPO_FLAGS = [
  '--repo-host',
  'github',
  '--repo-owner',
  'toopo',
  '--repo-name',
  'toopo',
] as const;

describe('parseArgs', () => {
  it('parses a directory, --database-url, and the repo coordinates', () => {
    expect(parseArgs(['./repo', '--database-url', 'file:graph.db', ...REPO_FLAGS])).toEqual({
      rootDir: './repo',
      databaseUrl: 'file:graph.db',
      gitignore: true,
      repo: { host: 'github', owner: 'toopo', name: 'toopo' },
      ownerUserId: 'system',
      workspaceId: 'system',
    });
  });

  it('accepts the optional `ingest` subcommand', () => {
    const parsed = parseArgs(['ingest', './repo', '--database-url', 'file:g.db', ...REPO_FLAGS]);
    expect(parsed.rootDir).toBe('./repo');
  });

  it('falls back to DATABASE_URL from the env', () => {
    const parsed = parseArgs(['./repo', ...REPO_FLAGS], { DATABASE_URL: 'postgres://x/y' });
    expect(parsed.databaseUrl).toBe('postgres://x/y');
  });

  it('prefers the explicit flag over the env', () => {
    const parsed = parseArgs(['./repo', '--database-url', 'file:a.db', ...REPO_FLAGS], {
      DATABASE_URL: 'file:b.db',
    });
    expect(parsed.databaseUrl).toBe('file:a.db');
  });

  it('honors --no-gitignore', () => {
    expect(
      parseArgs(['./repo', '--database-url', 'file:g.db', ...REPO_FLAGS, '--no-gitignore'])
        .gitignore,
    ).toBe(false);
  });

  it('takes an explicit --owner-user-id over the default', () => {
    const parsed = parseArgs([
      './repo',
      '--database-url',
      'file:g.db',
      ...REPO_FLAGS,
      '--owner-user-id',
      'user-7',
    ]);
    expect(parsed.ownerUserId).toBe('user-7');
  });

  it('takes an explicit --workspace-id over the default', () => {
    const parsed = parseArgs([
      './repo',
      '--database-url',
      'file:g.db',
      ...REPO_FLAGS,
      '--workspace-id',
      'ws-7',
    ]);
    expect(parsed.workspaceId).toBe('ws-7');
  });

  it('throws when the directory is missing', () => {
    expect(() => parseArgs(['--database-url', 'file:g.db', ...REPO_FLAGS])).toThrow(/Usage/);
  });

  it('throws when no database URL is given', () => {
    expect(() => parseArgs(['./repo', ...REPO_FLAGS])).toThrow(/database URL is required/);
  });

  it('throws when the repo coordinates are missing', () => {
    expect(() => parseArgs(['./repo', '--database-url', 'file:g.db'])).toThrow(
      /repo coordinates are required/,
    );
  });
});
