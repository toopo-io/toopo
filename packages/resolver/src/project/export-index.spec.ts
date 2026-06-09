import { FORMAT_VERSION, type GraphDocument } from '@toopo/core';
import type { ParseResult, ReExport } from '@toopo/parser';
import { describe, expect, it } from 'vitest';
import { buildExportIndex } from './export-index.js';

const emptyDoc: GraphDocument = { formatVersion: FORMAT_VERSION, nodes: [], edges: [] };

function fragment(overrides: Partial<ParseResult>): ParseResult {
  return { document: emptyDoc, unresolved: [], exports: [], reExports: [], ...overrides };
}

const reExport: ReExport = {
  exporterFileId: 'barrel.',
  exporterPath: 'src/index.tsx',
  specifier: './Button',
  kind: 'named',
  bindings: [{ name: 'Button', exportedAs: 'Button', typeOnly: false }],
  typeOnly: false,
};

describe('buildExportIndex', () => {
  it('keys local exports by their precise exported name across files', () => {
    const index = buildExportIndex([
      fragment({
        exports: [{ exporterFileId: 'A.', exportedName: 'X', symbolId: 'AX.', typeOnly: false }],
      }),
      fragment({
        exports: [
          { exporterFileId: 'B.', exportedName: 'default', symbolId: 'BD.', typeOnly: false },
        ],
      }),
    ]);

    expect(index.localExport('A.', 'X')).toBe('AX.');
    expect(index.localExport('B.', 'default')).toBe('BD.');
    expect(index.localExport('A.', 'missing')).toBeUndefined();
    expect(index.localExport('unknown.', 'X')).toBeUndefined();
  });

  it('collects re-export records per file and returns an empty list for files with none', () => {
    const index = buildExportIndex([
      fragment({ reExports: [reExport] }),
      fragment({ reExports: [{ ...reExport, specifier: './Other' }] }),
    ]);

    expect(index.reExports('barrel.')).toHaveLength(2);
    expect(index.reExports('barrel.')[0]?.specifier).toBe('./Button');
    expect(index.reExports('no-reexports.')).toEqual([]);
  });
});
