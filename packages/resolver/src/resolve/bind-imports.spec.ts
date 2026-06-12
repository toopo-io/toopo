import { type FileNode, FORMAT_VERSION, formatSymbolId, type GraphDocument } from '@toopo/core';
import {
  fileSymbolId,
  type ImportedBinding,
  type ParseResult,
  type UnresolvedImport,
} from '@toopo/parser';
import { describe, expect, it } from 'vitest';
import type { ModuleResolution, ResolverPlugin } from '../plugin/resolver-plugin.js';
import { bindFileImports } from './bind-imports.js';

const A = 'src/A.tsx';
const B_FILE = fileSymbolId('src/B.tsx');
const DET = { resolution: 'deterministic' } as const;
const dummyIndex = { fileId: () => undefined };
const exportIndex = { localExport: () => undefined, reExports: () => [] };
const project = { aliases: [], workspacePackages: [] };

function fileNode(path: string): FileNode {
  return {
    kind: 'file',
    id: fileSymbolId(path),
    path,
    contentHash: 'h',
    analysis: { status: 'analyzed' },
    properties: {},
  };
}

function named(name: string, kind: ImportedBinding['kind'] = 'named'): ImportedBinding {
  return { name, localName: name, kind, typeOnly: false };
}

function importOf(specifier: string, binding: ImportedBinding): UnresolvedImport {
  return {
    importerFileId: fileSymbolId(A),
    importerPath: A,
    specifier,
    imported: [binding],
    typeOnly: false,
    location: { startRow: 0, startColumn: 0, endRow: 0, endColumn: 1 },
  };
}

function consumer(unresolved: readonly UnresolvedImport[]): ParseResult {
  const document: GraphDocument = {
    formatVersion: FORMAT_VERSION,
    nodes: [fileNode(A)],
    edges: [],
  };
  return { document, unresolved, exports: [], reExports: [] };
}

/** A plugin whose export resolution canned-routes by name to each outcome. */
const plugin: ResolverPlugin = {
  id: 'fake',
  matches: () => true,
  resolveModule: (request): ModuleResolution =>
    request.specifier === './B'
      ? { status: 'internal', fileId: B_FILE, certainty: DET }
      : { status: 'unresolved', reason: 'no module' },
  resolveExport: (request) => {
    switch (request.exportedName) {
      case 'Widget':
        return { status: 'symbol', symbolId: 'WidgetSym.', certainty: DET };
      case 'ExtName':
        return { status: 'external', coordinate: { manager: 'npm', name: 'lib' }, name: 'ExtName' };
      case 'AmbName':
        return { status: 'ambiguous', candidates: ['x', 'y'] };
      default:
        return { status: 'unresolved', reason: 'no export' };
    }
  },
  bindCallSite: () => ({ edges: [], unresolved: [] }),
};

const externalId = formatSymbolId({
  package: { manager: 'npm', name: 'lib' },
  descriptors: [{ name: 'ExtName', suffix: 'term' }],
});

describe('bindFileImports', () => {
  it('binds a symbol import and a barrel-to-external import, and records both', () => {
    const { edges, resolvedImports } = bindFileImports(
      consumer([importOf('./B', named('Widget')), importOf('./B', named('ExtName'))]),
      fileNode(A),
      plugin,
      dummyIndex,
      exportIndex,
      project,
    );

    expect(edges).toContainEqual(
      expect.objectContaining({
        kind: 'imports',
        targetId: 'WidgetSym.',
        resolution: 'deterministic',
        provenance: { pass: 'resolve', rule: 'resolve/import' },
      }),
    );
    expect(edges).toContainEqual(
      expect.objectContaining({
        kind: 'imports',
        targetId: externalId,
        provenance: { pass: 'resolve', rule: 'resolve/import-external' },
      }),
    );
    expect(resolvedImports.get('Widget')?.symbolId).toBe('WidgetSym.');
    expect(resolvedImports.get('ExtName')?.symbolId).toBe(externalId);
  });

  it('emits a module-level edge + ambiguous-export diagnostic when no symbol binds', () => {
    const { edges, diagnostics } = bindFileImports(
      consumer([importOf('./B', named('AmbName')), importOf('./B', named('ns', 'namespace'))]),
      fileNode(A),
      plugin,
      dummyIndex,
      exportIndex,
      project,
    );

    expect(edges).toContainEqual(
      expect.objectContaining({
        kind: 'imports',
        targetId: B_FILE,
        provenance: { pass: 'resolve', rule: 'resolve/import-module' },
      }),
    );
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: 'ambiguous-export', specifier: './B' }),
    );
  });

  it('diagnoses an unresolved module with no edge', () => {
    const { edges, diagnostics } = bindFileImports(
      consumer([importOf('./missing', named('X'))]),
      fileNode(A),
      plugin,
      dummyIndex,
      exportIndex,
      project,
    );

    expect(edges).toEqual([]);
    expect(diagnostics).toEqual([
      expect.objectContaining({ code: 'unresolved-module', specifier: './missing' }),
    ]);
  });
});
