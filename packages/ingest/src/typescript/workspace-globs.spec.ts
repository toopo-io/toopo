import { describe, expect, it } from 'vitest';
import { matchesWorkspaceGlobs } from './workspace-globs';

describe('matchesWorkspaceGlobs', () => {
  it('matches a single segment for `*`', () => {
    expect(matchesWorkspaceGlobs('packages/core', ['packages/*'])).toBe(true);
    expect(matchesWorkspaceGlobs('apps/web', ['packages/*', 'apps/*'])).toBe(true);
    // `*` is one segment only — a nested dir does not match `packages/*`.
    expect(matchesWorkspaceGlobs('packages/core/sub', ['packages/*'])).toBe(false);
  });

  it('matches any depth for `**`', () => {
    expect(matchesWorkspaceGlobs('packages/group/core', ['packages/**'])).toBe(true);
    expect(matchesWorkspaceGlobs('packages/core', ['packages/**'])).toBe(true);
  });

  it('matches a literal pattern exactly', () => {
    expect(matchesWorkspaceGlobs('tooling/tsconfig', ['tooling/tsconfig'])).toBe(true);
    expect(matchesWorkspaceGlobs('tooling/other', ['tooling/tsconfig'])).toBe(false);
  });

  it('honors `!` exclusions over inclusions', () => {
    const globs = ['packages/*', '!packages/internal'];
    expect(matchesWorkspaceGlobs('packages/core', globs)).toBe(true);
    expect(matchesWorkspaceGlobs('packages/internal', globs)).toBe(false);
  });

  it('does not match when no include glob applies', () => {
    expect(matchesWorkspaceGlobs('vendor/x', ['packages/*'])).toBe(false);
  });
});
