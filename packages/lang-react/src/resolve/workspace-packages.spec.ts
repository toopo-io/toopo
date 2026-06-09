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
});
