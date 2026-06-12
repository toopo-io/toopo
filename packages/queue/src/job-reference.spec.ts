import { describe, expect, it } from 'vitest';
import { parseJobReference } from './job-reference.js';

const VALID = {
  projectId: 'proj-1',
  repo: { host: 'github.com', owner: 'toopo', name: 'toopo' },
  commitSha: 'a'.repeat(40),
};

describe('parseJobReference', () => {
  it('accepts a well-formed reference and returns the typed shape', () => {
    expect(parseJobReference(VALID)).toEqual(VALID);
  });

  it('accepts a SHA-256 commit id (64 hex)', () => {
    const ref = { ...VALID, commitSha: 'f'.repeat(64) };
    expect(parseJobReference(ref).commitSha).toBe('f'.repeat(64));
  });

  it('trims surrounding whitespace on coordinates', () => {
    const parsed = parseJobReference({
      ...VALID,
      projectId: '  proj-1  ',
      repo: { host: ' github.com ', owner: ' toopo ', name: ' toopo ' },
    });
    expect(parsed.projectId).toBe('proj-1');
    expect(parsed.repo).toEqual(VALID.repo);
  });

  it('rejects a short/abbreviated commit sha', () => {
    expect(() => parseJobReference({ ...VALID, commitSha: 'abc1234' })).toThrow(/commitSha/);
  });

  it('rejects an uppercase commit sha (canonical lowercase only)', () => {
    expect(() => parseJobReference({ ...VALID, commitSha: 'A'.repeat(40) })).toThrow(/commitSha/);
  });

  it('rejects an empty projectId', () => {
    expect(() => parseJobReference({ ...VALID, projectId: '   ' })).toThrow(/projectId/);
  });

  it('rejects empty repo coordinates', () => {
    expect(() =>
      parseJobReference({ ...VALID, repo: { host: '', owner: 'o', name: 'n' } }),
    ).toThrow(/repo\.host/);
  });

  it('REJECTS a non-canonical repo host (a token must never travel off-GitHub)', () => {
    expect(() =>
      parseJobReference({ ...VALID, repo: { ...VALID.repo, host: 'gitlab.com' } }),
    ).toThrow(/repo\.host/);
  });

  it('REJECTS a smuggled code-bearing field (reference-only, security baseline)', () => {
    const smuggled = { ...VALID, code: 'rm -rf /', patch: 'diff', content: '...' };
    expect(() => parseJobReference(smuggled)).toThrow();
  });

  it('rejects an extra field nested under repo', () => {
    const smuggled = { ...VALID, repo: { ...VALID.repo, token: 'secret' } };
    expect(() => parseJobReference(smuggled)).toThrow();
  });

  it('rejects a non-object input', () => {
    expect(() => parseJobReference('not-an-object')).toThrow();
    expect(() => parseJobReference(null)).toThrow();
  });
});
