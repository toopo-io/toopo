import { describe, expect, it } from 'vitest';
import { buildIgnoreFilter } from './ignore-filter';

describe('buildIgnoreFilter', () => {
  it('ignores nothing when there are no .gitignore sources', () => {
    const isIgnored = buildIgnoreFilter(new Map());
    expect(isIgnored('src/a.ts')).toBe(false);
  });

  it('applies a root .gitignore to the whole tree', () => {
    const isIgnored = buildIgnoreFilter(new Map([['', 'dist/\n*.log\n']]));
    expect(isIgnored('dist/bundle.js')).toBe(true);
    expect(isIgnored('logs/app.log')).toBe(true);
    expect(isIgnored('src/index.ts')).toBe(false);
  });

  it('scopes a nested .gitignore to its own subtree', () => {
    const isIgnored = buildIgnoreFilter(new Map([['packages/web', 'generated/\n']]));
    // The rule is relative to packages/web, so it must not leak to siblings.
    expect(isIgnored('packages/web/generated/x.ts')).toBe(true);
    expect(isIgnored('packages/api/generated/x.ts')).toBe(false);
    expect(isIgnored('generated/x.ts')).toBe(false);
  });

  it('keeps two same-depth nested .gitignore files scoped to their own subtrees', () => {
    const isIgnored = buildIgnoreFilter(
      new Map([
        ['packages/a', 'local.ts\n'],
        ['packages/b', 'other.ts\n'],
      ]),
    );
    expect(isIgnored('packages/a/local.ts')).toBe(true);
    expect(isIgnored('packages/a/other.ts')).toBe(false);
    expect(isIgnored('packages/b/other.ts')).toBe(true);
    expect(isIgnored('packages/b/local.ts')).toBe(false);
  });

  it('lets a deeper .gitignore re-include a file the root excluded (git precedence)', () => {
    const isIgnored = buildIgnoreFilter(
      new Map([
        ['', '*.snap\n'],
        ['packages/ui', '!button.snap\n'],
      ]),
    );
    expect(isIgnored('packages/ui/button.snap')).toBe(false); // re-included by the deeper rule
    expect(isIgnored('packages/ui/modal.snap')).toBe(true); // still ignored by root
    expect(isIgnored('other/x.snap')).toBe(true);
  });
});
