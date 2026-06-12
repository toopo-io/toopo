import { describe, expect, it } from 'vitest';
import type {
  ExportIndex,
  ExportResolution,
  ModuleIndex,
  ModuleResolution,
  ResolverPlugin,
} from '../plugin/resolver-plugin.js';
import { resolveExportChain } from './export-chain.js';

const DET = { resolution: 'deterministic' } as const;

// Export hops keyed by `${fileId}|${name}`, module hops by specifier.
const exportTable: Record<string, ExportResolution> = {
  'barrel.|Button': {
    status: 're-export',
    specifier: './Button',
    importerPath: 'i',
    exportedName: 'Button',
    certainty: DET,
  },
  'Button.|Button': { status: 'symbol', symbolId: 'ButtonSym.', certainty: DET },
  'star.|X': {
    status: 're-export',
    specifier: './x',
    importerPath: 'i',
    exportedName: 'X',
    certainty: { resolution: 'inferred', confidence: 'high' },
  },
  'x.|X': { status: 'symbol', symbolId: 'XSym.', certainty: DET },
  'pkg.|P': {
    status: 're-export',
    specifier: 'react',
    importerPath: 'i',
    exportedName: 'P',
    certainty: DET,
  },
  'amb.|A': { status: 'ambiguous', candidates: ['./a', './b'] },
  'extHop.|E': { status: 'external', coordinate: { manager: 'npm', name: 'lib' }, name: 'E' },
  'badMod.|B': {
    status: 're-export',
    specifier: './missing',
    importerPath: 'i',
    exportedName: 'B',
    certainty: DET,
  },
  'ambMod.|M': {
    status: 're-export',
    specifier: './ambig',
    importerPath: 'i',
    exportedName: 'M',
    certainty: DET,
  },
  'a.|C': {
    status: 're-export',
    specifier: './b',
    importerPath: 'i',
    exportedName: 'C',
    certainty: DET,
  },
  'b.|C': {
    status: 're-export',
    specifier: './a',
    importerPath: 'i',
    exportedName: 'C',
    certainty: DET,
  },
  // Multi-star barrels: probe ./p and ./q (and 'react') for the name.
  'multi.|U': {
    status: 'multi-star',
    specifiers: ['./p', './q'],
    importerPath: 'i',
    exportedName: 'U',
  },
  'multi.|D': {
    status: 'multi-star',
    specifiers: ['./p', './q'],
    importerPath: 'i',
    exportedName: 'D',
  },
  'multi.|N': {
    status: 'multi-star',
    specifiers: ['./p', './q'],
    importerPath: 'i',
    exportedName: 'N',
  },
  'multi.|R': {
    status: 'multi-star',
    specifiers: ['./p', 'react'],
    importerPath: 'i',
    exportedName: 'R',
  },
  'p.|U': { status: 'symbol', symbolId: 'Up.', certainty: DET },
  'p.|D': { status: 'symbol', symbolId: 'Dp.', certainty: DET },
  'q.|D': { status: 'symbol', symbolId: 'Dq.', certainty: DET },
};
const moduleTable: Record<string, ModuleResolution> = {
  './Button': { status: 'internal', fileId: 'Button.', certainty: DET },
  './x': { status: 'internal', fileId: 'x.', certainty: DET },
  './a': { status: 'internal', fileId: 'a.', certainty: DET },
  './b': { status: 'internal', fileId: 'b.', certainty: DET },
  './ambig': { status: 'ambiguous', candidates: ['c1', 'c2'] },
  './p': { status: 'internal', fileId: 'p.', certainty: DET },
  './q': { status: 'internal', fileId: 'q.', certainty: DET },
  react: { status: 'external', coordinate: { manager: 'npm', name: 'react' } },
};

const plugin: ResolverPlugin = {
  id: 'fake',
  matches: () => true,
  resolveModule: (request) =>
    moduleTable[request.specifier] ?? { status: 'unresolved', reason: 'no module' },
  resolveExport: (request) =>
    exportTable[`${request.fileId}|${request.exportedName}`] ?? {
      status: 'unresolved',
      reason: 'no export',
    },
  bindCallSite: () => ({ edges: [], unresolved: [] }),
};

const moduleIndex: ModuleIndex = { fileId: () => undefined };
const exportIndex: ExportIndex = { localExport: () => undefined, reExports: () => [] };
const project = { aliases: [], workspacePackages: [] };
const start = (fileId: string, exportedName: string) => ({ fileId, exportedName, typeOnly: false });

describe('resolveExportChain', () => {
  it('follows a named barrel redirect to the defining symbol, deterministically', () => {
    expect(
      resolveExportChain(start('barrel.', 'Button'), plugin, moduleIndex, exportIndex, project),
    ).toEqual({
      status: 'symbol',
      symbolId: 'ButtonSym.',
      certainty: { resolution: 'deterministic' },
    });
  });

  it('keeps the whole chain INFERRED when any hop is a star re-export', () => {
    expect(
      resolveExportChain(start('star.', 'X'), plugin, moduleIndex, exportIndex, project),
    ).toEqual({
      status: 'symbol',
      symbolId: 'XSym.',
      certainty: { resolution: 'inferred', confidence: 'high' },
    });
  });

  it('ends as external when a barrel re-exports from a package', () => {
    expect(
      resolveExportChain(start('pkg.', 'P'), plugin, moduleIndex, exportIndex, project),
    ).toEqual({
      status: 'external',
      coordinate: { manager: 'npm', name: 'react' },
      name: 'P',
    });
  });

  it('terminates a re-export cycle as unresolved (no infinite loop)', () => {
    const result = resolveExportChain(start('a.', 'C'), plugin, moduleIndex, exportIndex, project);
    expect(result.status).toBe('unresolved');
  });

  it('returns a direct symbol without redirecting', () => {
    expect(
      resolveExportChain(start('Button.', 'Button'), plugin, moduleIndex, exportIndex, project),
    ).toEqual({
      status: 'symbol',
      symbolId: 'ButtonSym.',
      certainty: { resolution: 'deterministic' },
    });
  });

  it('propagates an ambiguous hop and an external hop unchanged', () => {
    expect(
      resolveExportChain(start('amb.', 'A'), plugin, moduleIndex, exportIndex, project),
    ).toEqual({
      status: 'ambiguous',
      candidates: ['./a', './b'],
    });
    expect(
      resolveExportChain(start('extHop.', 'E'), plugin, moduleIndex, exportIndex, project),
    ).toEqual({
      status: 'external',
      coordinate: { manager: 'npm', name: 'lib' },
      name: 'E',
    });
  });

  it('resolves a multi-star name to its UNIQUE provider, deterministically', () => {
    // U lives only behind ./p; probing both stars proves it unique.
    expect(
      resolveExportChain(start('multi.', 'U'), plugin, moduleIndex, exportIndex, project),
    ).toEqual({ status: 'symbol', symbolId: 'Up.', certainty: { resolution: 'deterministic' } });
  });

  it('leaves a multi-star name exported by two stars ambiguous', () => {
    expect(
      resolveExportChain(start('multi.', 'D'), plugin, moduleIndex, exportIndex, project),
    ).toEqual({ status: 'ambiguous', candidates: ['Dp.', 'Dq.'] });
  });

  it('leaves a multi-star name provided by no star unresolved', () => {
    expect(
      resolveExportChain(start('multi.', 'N'), plugin, moduleIndex, exportIndex, project).status,
    ).toBe('unresolved');
  });

  it('resolves a multi-star name to an external star provider', () => {
    expect(
      resolveExportChain(start('multi.', 'R'), plugin, moduleIndex, exportIndex, project),
    ).toEqual({ status: 'external', coordinate: { manager: 'npm', name: 'react' }, name: 'R' });
  });

  it('ends unresolved or ambiguous when a redirect module fails to resolve', () => {
    expect(
      resolveExportChain(start('badMod.', 'B'), plugin, moduleIndex, exportIndex, project).status,
    ).toBe('unresolved');
    expect(
      resolveExportChain(start('ambMod.', 'M'), plugin, moduleIndex, exportIndex, project),
    ).toEqual({
      status: 'ambiguous',
      candidates: ['c1', 'c2'],
    });
  });
});
