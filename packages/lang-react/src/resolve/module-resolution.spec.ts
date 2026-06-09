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

  describe('TS-ESM (NodeNext) extension mapping', () => {
    it('maps a ./foo.js specifier to its ./foo.ts source', () => {
      const result = resolveModule(
        request('./foo.js'),
        indexWith({ 'src/foo.ts': 'Foo.' }),
        project(),
      );
      expect(result).toEqual({
        status: 'internal',
        fileId: 'Foo.',
        certainty: { resolution: 'deterministic' },
      });
    });

    it('maps a ./Comp.js specifier to a ./Comp.tsx source', () => {
      const result = resolveModule(
        request('./Comp.js'),
        indexWith({ 'src/Comp.tsx': 'Comp.' }),
        project(),
      );
      expect(result).toMatchObject({ status: 'internal', fileId: 'Comp.' });
    });

    it('maps .mjs to .mts and .cjs to .cts', () => {
      expect(
        resolveModule(request('./esm.mjs'), indexWith({ 'src/esm.mts': 'E.' }), project()),
      ).toMatchObject({ status: 'internal', fileId: 'E.' });
      expect(
        resolveModule(request('./cm.cjs'), indexWith({ 'src/cm.cts': 'C.' }), project()),
      ).toMatchObject({ status: 'internal', fileId: 'C.' });
    });

    it('prefers the TS source over a literal .js file of the same name', () => {
      const result = resolveModule(
        request('./foo.js'),
        indexWith({ 'src/foo.ts': 'Src.', 'src/foo.js': 'Js.' }),
        project(),
      );
      expect(result).toMatchObject({ status: 'internal', fileId: 'Src.' });
    });

    it('falls back to the literal .js file when no TS source exists', () => {
      const result = resolveModule(
        request('./legacy.js'),
        indexWith({ 'src/legacy.js': 'Legacy.' }),
        project(),
      );
      expect(result).toMatchObject({ status: 'internal', fileId: 'Legacy.' });
    });

    it('maps a .js specifier through a tsconfig alias to its .ts source', () => {
      const result = resolveModule(
        request('@/util.js'),
        indexWith({ 'src/util.ts': 'Util.' }),
        project([{ pattern: '@/*', targets: ['src/*'] }]),
      );
      expect(result).toMatchObject({ status: 'internal', fileId: 'Util.' });
    });
  });
});
