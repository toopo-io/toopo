import type { ReExport } from '@toopo/parser';
import type { ExportIndex } from '@toopo/resolver';
import { describe, expect, it } from 'vitest';
import { resolveExport } from './export-resolution';

function reExport(
  kind: ReExport['kind'],
  specifier: string,
  bindings: ReExport['bindings'] = [],
): ReExport {
  return {
    exporterFileId: 'barrel.',
    exporterPath: 'src/index.tsx',
    specifier,
    kind,
    bindings,
    typeOnly: false,
  };
}

function index(options: {
  local?: Record<string, string>;
  reExports?: readonly ReExport[];
}): ExportIndex {
  return {
    localExport: (_fileId, name) => options.local?.[name],
    reExports: () => options.reExports ?? [],
  };
}

const request = (exportedName: string) => ({ fileId: 'barrel.', exportedName, typeOnly: false });

describe('resolveExport (React)', () => {
  it('resolves a direct local export to its symbol, deterministically', () => {
    const result = resolveExport(request('Button'), index({ local: { Button: 'Button.' } }));
    expect(result).toEqual({
      status: 'symbol',
      symbolId: 'Button.',
      certainty: { resolution: 'deterministic' },
    });
  });

  it('redirects an explicit named re-export deterministically, keeping the source name', () => {
    const result = resolveExport(
      request('Btn'),
      index({
        reExports: [
          reExport('named', './Button', [{ name: 'Button', exportedAs: 'Btn', typeOnly: false }]),
        ],
      }),
    );
    expect(result).toEqual({
      status: 're-export',
      specifier: './Button',
      importerPath: 'src/index.tsx',
      exportedName: 'Button',
      certainty: { resolution: 'deterministic' },
    });
  });

  it('redirects a single star re-export as INFERRED (a wildcard, not a proof)', () => {
    const result = resolveExport(
      request('Button'),
      index({ reExports: [reExport('star', './ui')] }),
    );
    expect(result).toEqual({
      status: 're-export',
      specifier: './ui',
      importerPath: 'src/index.tsx',
      exportedName: 'Button',
      certainty: { resolution: 'inferred', confidence: 'high' },
    });
  });

  it('defers two star sources to the engine as MULTI-STAR (it probes each target)', () => {
    const result = resolveExport(
      request('Button'),
      index({ reExports: [reExport('star', './a'), reExport('star', './b')] }),
    );
    expect(result).toEqual({
      status: 'multi-star',
      specifiers: ['./a', './b'],
      importerPath: 'src/index.tsx',
      exportedName: 'Button',
    });
  });

  it('prefers an explicit named re-export over a star (named wins, deterministic)', () => {
    const result = resolveExport(
      request('Button'),
      index({
        reExports: [
          reExport('named', './Button', [
            { name: 'Button', exportedAs: 'Button', typeOnly: false },
          ]),
          reExport('star', './ui'),
        ],
      }),
    );
    expect(result.status).toBe('re-export');
    if (result.status === 're-export') {
      expect(result.certainty).toEqual({ resolution: 'deterministic' });
      expect(result.specifier).toBe('./Button');
    }
  });

  it('is unresolved when no local, named, or star export supplies the name', () => {
    const result = resolveExport(
      request('Missing'),
      index({
        reExports: [
          reExport('namespace', './m', [{ name: '*', exportedAs: 'ns', typeOnly: false }]),
        ],
      }),
    );
    expect(result.status).toBe('unresolved');
  });
});
