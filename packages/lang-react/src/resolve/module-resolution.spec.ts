import type { AliasRule, ModuleIndex, ProjectModel } from '@toopo/resolver';
import { describe, expect, it } from 'vitest';
import { resolveModule } from './module-resolution';

const emptyIndex: ModuleIndex = { fileId: () => undefined };

function indexWith(paths: Record<string, string>): ModuleIndex {
  return { fileId: (path) => paths[path] };
}

function project(aliases: readonly AliasRule[] = []): ProjectModel {
  return { aliases, workspacePackages: [] };
}

const request = (specifier: string) => ({
  specifier,
  importerPath: 'src/App.tsx',
  importerFileId: 'App.',
  typeOnly: false,
});

describe('resolveModule (React)', () => {
  it('resolves a relative specifier through TS extension probing', () => {
    const result = resolveModule(
      request('./Button'),
      indexWith({ 'src/Button.tsx': 'Button.' }),
      project(),
    );
    expect(result).toEqual({
      status: 'internal',
      fileId: 'Button.',
      certainty: { resolution: 'deterministic' },
    });
  });

  it('resolves a relative directory specifier to its index file', () => {
    const result = resolveModule(
      request('./ui'),
      indexWith({ 'src/ui/index.tsx': 'UiIndex.' }),
      project(),
    );
    expect(result).toEqual({
      status: 'internal',
      fileId: 'UiIndex.',
      certainty: { resolution: 'deterministic' },
    });
  });

  it('classifies a bare specifier as an external npm package (scoped names kept)', () => {
    expect(resolveModule(request('react'), emptyIndex, project())).toEqual({
      status: 'external',
      coordinate: { manager: 'npm', name: 'react' },
    });
    expect(resolveModule(request('@scope/pkg/sub'), emptyIndex, project())).toEqual({
      status: 'external',
      coordinate: { manager: 'npm', name: '@scope/pkg' },
    });
  });

  it('resolves an alias specifier through the tsconfig paths table, deterministically', () => {
    const aliases: AliasRule[] = [{ pattern: '@/*', targets: ['src/*'] }];
    const result = resolveModule(
      request('@/components/Button'),
      indexWith({ 'src/components/Button.tsx': 'CB.' }),
      project(aliases),
    );
    expect(result).toEqual({
      status: 'internal',
      fileId: 'CB.',
      certainty: { resolution: 'deterministic' },
    });
  });

  it('picks the longest-matching alias rule and tries its targets in order', () => {
    const aliases: AliasRule[] = [
      { pattern: '@/*', targets: ['src/*'] },
      { pattern: '@/components/*', targets: ['design/*', 'src/components/*'] },
    ];
    const result = resolveModule(
      request('@/components/Button'),
      indexWith({ 'src/components/Button.tsx': 'CB.' }),
      project(aliases),
    );
    // The longer '@/components/*' rule wins; 'design/*' misses, 'src/components/*' resolves.
    expect(result).toEqual({
      status: 'internal',
      fileId: 'CB.',
      certainty: { resolution: 'deterministic' },
    });
  });

  it('leaves an alias unresolved when no rule or target matches a parsed file', () => {
    expect(resolveModule(request('@/x'), emptyIndex, project()).status).toBe('unresolved');
    expect(
      resolveModule(request('@/x'), emptyIndex, project([{ pattern: '@/*', targets: ['src/*'] }]))
        .status,
    ).toBe('unresolved');
  });

  it('is unresolved when a relative specifier matches no parsed file', () => {
    expect(resolveModule(request('./Nowhere'), emptyIndex, project()).status).toBe('unresolved');
  });
});
