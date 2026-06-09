import { describe, expect, it } from 'vitest';
import { parseArgs } from './args';

describe('parseArgs', () => {
  it('parses the directory positional with gitignore on by default', () => {
    expect(parseArgs(['./repo'])).toEqual({ rootDir: './repo', gitignore: true });
  });

  it('parses the json path, title, and --no-gitignore flags', () => {
    const options = parseArgs([
      'repo',
      '--json',
      'out.json',
      '--title',
      'My Report',
      '--no-gitignore',
    ]);
    expect(options).toEqual({
      rootDir: 'repo',
      gitignore: false,
      jsonPath: 'out.json',
      title: 'My Report',
    });
  });

  it('throws the usage line when the directory is missing', () => {
    expect(() => parseArgs([])).toThrow(/Usage: toopo-ingest/);
  });

  it('throws on an unknown flag', () => {
    expect(() => parseArgs(['repo', '--bogus'])).toThrow();
  });
});
