import { describe, expect, it } from 'vitest';
import { buildWorkspacePackages, type WorkspacePackageInput } from './workspace-packages';

const exists = (...paths: string[]) => {
  const set = new Set(paths);
  return (path: string) => set.has(path);
};

describe('buildWorkspacePackages', () => {
  it('prefers the src/index.ts source entry over the built main', () => {
    const inputs: WorkspacePackageInput[] = [
      { name: '@toopo/core', dir: 'packages/core', main: './dist/index.js' },
    ];
    const result = buildWorkspacePackages(inputs, exists('packages/core/src/index.ts'));
    expect(result).toEqual([{ name: '@toopo/core', entry: 'packages/core/src/index.ts' }]);
  });

  it('derives a source entry from the built main when no conventional entry exists', () => {
    const inputs: WorkspacePackageInput[] = [
      { name: '@acme/widget', dir: 'libs/widget', main: './dist/entry.js' },
    ];
    const result = buildWorkspacePackages(inputs, exists('libs/widget/src/entry.ts'));
    expect(result).toEqual([{ name: '@acme/widget', entry: 'libs/widget/src/entry.ts' }]);
  });

  it('drops a package whose source entry is not in the analyzed set (no guessing)', () => {
    const inputs: WorkspacePackageInput[] = [
      { name: '@toopo/core', dir: 'packages/core', main: './dist/index.js' },
    ];
    const result = buildWorkspacePackages(inputs, exists('packages/core/dist/index.js'));
    expect(result).toEqual([]);
  });

  it('resolves a .tsx index when that is what exists', () => {
    const inputs: WorkspacePackageInput[] = [{ name: '@toopo/ui', dir: 'packages/ui' }];
    const result = buildWorkspacePackages(inputs, exists('packages/ui/src/index.tsx'));
    expect(result).toEqual([{ name: '@toopo/ui', entry: 'packages/ui/src/index.tsx' }]);
  });

  it('resolves exact subpath exports to their source files (entry-less package)', () => {
    const inputs: WorkspacePackageInput[] = [
      {
        name: '@toopo/ui',
        dir: 'packages/ui',
        exports: {
          './globals.css': './src/styles/globals.css', // non-source → skipped
          './components/button': {
            types: './dist/components/button.d.ts',
            import: './dist/components/button.js',
          },
          './lib/utils': './dist/lib/utils.js',
          './components/*': './dist/components/*.js', // wildcard → deferred
        },
      },
    ];
    const result = buildWorkspacePackages(
      inputs,
      exists('packages/ui/src/components/button.tsx', 'packages/ui/src/lib/utils.ts'),
    );
    // No main entry, but subpaths resolve → the package is still contributed.
    expect(result).toEqual([
      {
        name: '@toopo/ui',
        subpathExports: [
          { subpath: 'components/button', entry: 'packages/ui/src/components/button.tsx' },
          { subpath: 'lib/utils', entry: 'packages/ui/src/lib/utils.ts' },
        ],
      },
    ]);
  });

  it('keeps both the main entry and subpath exports when present', () => {
    const inputs: WorkspacePackageInput[] = [
      {
        name: '@toopo/db',
        dir: 'packages/db',
        exports: {
          '.': './dist/index.js', // the main entry, handled separately
          './schema': './dist/schema/index.js',
        },
      },
    ];
    const result = buildWorkspacePackages(
      inputs,
      exists('packages/db/src/index.ts', 'packages/db/src/schema/index.ts'),
    );
    expect(result).toEqual([
      {
        name: '@toopo/db',
        entry: 'packages/db/src/index.ts',
        subpathExports: [{ subpath: 'schema', entry: 'packages/db/src/schema/index.ts' }],
      },
    ]);
  });
});
