import { describe, expect, it } from 'vitest';
import { dirname, normalizeRepoPath, resolveRelative } from './paths.js';

describe('repo path helpers', () => {
  it('normalizes separators and a leading ./ or /', () => {
    expect(normalizeRepoPath('src\\a\\b.tsx')).toBe('src/a/b.tsx');
    expect(normalizeRepoPath('./src/a.tsx')).toBe('src/a.tsx');
    expect(normalizeRepoPath('/src/a.tsx')).toBe('src/a.tsx');
  });

  it('takes the directory of a path', () => {
    expect(dirname('src/components/App.tsx')).toBe('src/components');
    expect(dirname('App.tsx')).toBe('');
  });

  it('resolves a relative specifier against the importing file', () => {
    expect(resolveRelative('src/App.tsx', './Button')).toBe('src/Button');
    expect(resolveRelative('src/ui/App.tsx', '../Button')).toBe('src/Button');
    expect(resolveRelative('src/ui/App.tsx', '../../lib/x')).toBe('lib/x');
    expect(resolveRelative('src/App.tsx', './ui/Button')).toBe('src/ui/Button');
  });
});
