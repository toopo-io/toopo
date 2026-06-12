import {
  type CallSitePayloadArgument,
  composeCallSiteId,
  type Descriptor,
  type Edge,
  FORMAT_VERSION,
  formatSymbolId,
  type GraphDocument,
  type Node,
  type SymbolId,
} from '@toopo/core';
import { fileIdentity, fileSymbolId, type ParseResult } from '@toopo/parser';
import { describe, expect, it } from 'vitest';
import type { ResolverPlugin } from '../plugin/resolver-plugin.js';
import { resolveProject } from './resolve-project.js';

// --- id helpers (mirror the parser's minting) -------------------------------
const term = (name: string): Descriptor => ({ name, suffix: 'term' });
const parameter = (name: string): Descriptor => ({ name, suffix: 'parameter' });
function path(file: string, ...descriptors: Descriptor[]): SymbolId {
  const base = fileIdentity(file);
  return formatSymbolId({ ...base, descriptors: [...base.descriptors, ...descriptors] });
}

const B = 'src/B.tsx';
const A = 'src/A.tsx';
const WIDGET = path(B, term('Widget'));
const LABEL = path(B, term('Widget'), parameter('label'));
const APP = path(A, term('App'));
const RENDER_SITE = composeCallSiteId({
  enclosingSymbolId: APP,
  calleeReference: 'Widget',
  ordinal: 0,
});

function fileNode(file: string): Node {
  return {
    kind: 'file',
    id: fileSymbolId(file),
    path: file,
    contentHash: `hash-${file}`,
    analysis: { status: 'analyzed' },
    properties: {},
  };
}

function symbolNode(id: SymbolId, name: string, subKind: string): Node {
  return { kind: 'symbol', id, name, subKind, properties: {} };
}

function containsEdge(sourceId: SymbolId, targetId: SymbolId, rule: string): Edge {
  return {
    kind: 'contains',
    sourceId,
    targetId,
    provenance: { pass: 'parse', rule },
    resolution: 'deterministic',
  };
}

/** A provider module that defines and exports `Widget` with a `label` prop. */
function providerFragment(): ParseResult {
  const document: GraphDocument = {
    formatVersion: FORMAT_VERSION,
    nodes: [
      fileNode(B),
      symbolNode(WIDGET, 'Widget', 'react:component'),
      symbolNode(LABEL, 'label', 'react:prop'),
    ],
    edges: [
      containsEdge(fileSymbolId(B), WIDGET, 'react/contains-symbol'),
      containsEdge(WIDGET, LABEL, 'react/declares-prop'),
    ],
  };
  return {
    document,
    unresolved: [],
    exports: [
      {
        exporterFileId: fileSymbolId(B),
        exportedName: 'Widget',
        symbolId: WIDGET,
        typeOnly: false,
      },
    ],
    reExports: [],
  };
}

const labelArg: CallSitePayloadArgument = {
  ordinal: 0,
  name: 'label',
  passKind: 'named',
  value: '"x"',
  resolution: 'deterministic',
};

/** A consumer module that renders `<Widget label="x" />` and imports many ways. */
function consumerFragment(): ParseResult {
  const document: GraphDocument = {
    formatVersion: FORMAT_VERSION,
    nodes: [
      fileNode(A),
      symbolNode(APP, 'App', 'react:component'),
      {
        kind: 'callSite',
        id: RENDER_SITE,
        enclosingSymbolId: APP,
        callee: 'Widget',
        ordinal: 0,
        subKind: 'react:element',
        payload: [labelArg],
        properties: {},
      },
    ],
    edges: [
      containsEdge(fileSymbolId(A), APP, 'react/contains-symbol'),
      containsEdge(APP, RENDER_SITE, 'react/contains-callsite'),
    ],
  };
  const named = (name: string) => ({
    name,
    localName: name,
    kind: 'named' as const,
    typeOnly: false,
  });
  return {
    document,
    unresolved: [
      {
        importerFileId: fileSymbolId(A),
        importerPath: A,
        specifier: './B',
        imported: [named('Widget')],
        typeOnly: false,
        location: { startRow: 0, startColumn: 0, endRow: 0, endColumn: 1 },
      },
      {
        importerFileId: fileSymbolId(A),
        importerPath: A,
        specifier: './B',
        imported: [named('Ghost')],
        typeOnly: false,
        location: { startRow: 1, startColumn: 0, endRow: 1, endColumn: 1 },
      },
      {
        importerFileId: fileSymbolId(A),
        importerPath: A,
        specifier: './missing',
        imported: [named('X')],
        typeOnly: false,
        location: { startRow: 2, startColumn: 0, endRow: 2, endColumn: 1 },
      },
      {
        importerFileId: fileSymbolId(A),
        importerPath: A,
        specifier: './ambig',
        imported: [named('Y')],
        typeOnly: false,
        location: { startRow: 3, startColumn: 0, endRow: 3, endColumn: 1 },
      },
      {
        importerFileId: fileSymbolId(A),
        importerPath: A,
        specifier: './ext',
        imported: [named('Z')],
        typeOnly: false,
        location: { startRow: 4, startColumn: 0, endRow: 4, endColumn: 1 },
      },
      {
        importerFileId: fileSymbolId(A),
        importerPath: A,
        specifier: './mod',
        imported: [{ name: '*', localName: 'ns', kind: 'namespace', typeOnly: false }],
        typeOnly: false,
        location: { startRow: 5, startColumn: 0, endRow: 5, endColumn: 1 },
      },
    ],
    exports: [],
    reExports: [],
  };
}

/** A fake plugin that canned-resolves by specifier and binds exact callees. */
function fakePlugin(): ResolverPlugin {
  return {
    id: 'fake',
    matches: (file) => file.path.endsWith('.tsx'),
    resolveModule: (request) => {
      switch (request.specifier) {
        case './B':
        case './mod':
          return {
            status: 'internal',
            fileId: fileSymbolId(B),
            certainty: { resolution: 'deterministic' },
          };
        case './ambig':
          return { status: 'ambiguous', candidates: ['c1', 'c2'] };
        case './ext':
          return { status: 'external', coordinate: { manager: 'npm', name: 'ext' } };
        default:
          return { status: 'unresolved', reason: `no file for ${request.specifier}` };
      }
    },
    resolveExport: (request) =>
      request.exportedName === 'Widget'
        ? { status: 'symbol', symbolId: WIDGET, certainty: { resolution: 'deterministic' } }
        : { status: 'unresolved', reason: `no export ${request.exportedName}` },
    bindCallSite: (callSite, resolvedImports, _namespaceImports, symbols) => {
      const resolved = resolvedImports.get(callSite.callee);
      if (resolved === undefined) {
        return { edges: [], unresolved: [] };
      }
      const isRender = callSite.subKind === 'react:element';
      const edges = [
        {
          kind: 'calls' as const,
          sourceId: callSite.callSiteId,
          targetId: resolved.symbolId,
          rule: isRender ? 'fake/renders' : 'fake/calls',
          ...(isRender ? { subKind: 'fake:renders' } : {}),
          certainty: resolved.certainty,
        },
      ];
      if (!isRender) {
        return { edges, unresolved: [] };
      }
      for (const child of symbols.declaredChildren(resolved.symbolId)) {
        const arg = callSite.payload.find((a) => a.passKind === 'named' && a.name === child.name);
        if (child.subKind === 'react:prop' && arg !== undefined) {
          edges.push({
            kind: 'references' as const,
            sourceId: callSite.callSiteId,
            targetId: child.id,
            rule: 'fake/binds',
            subKind: 'fake:prop',
            certainty: resolved.certainty,
          });
        }
      }
      return { edges, unresolved: [] };
    },
  };
}

function resolveEdges(document: GraphDocument) {
  return document.edges
    .filter((edge) => edge.provenance.pass === 'resolve')
    .map((edge) => ({
      kind: edge.kind,
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      rule: edge.provenance.rule,
      subKind: edge.subKind,
      resolution: edge.resolution,
    }));
}

describe('resolveProject — Slice 2 cross-file binding', () => {
  it('binds a relative import to its exported symbol and re-emits the deferred render + prop', () => {
    const { document } = resolveProject([consumerFragment(), providerFragment()], [fakePlugin()]);

    const edges = resolveEdges(document);
    expect(edges).toContainEqual({
      kind: 'imports',
      sourceId: fileSymbolId(A),
      targetId: WIDGET,
      rule: 'resolve/import',
      subKind: undefined,
      resolution: 'deterministic',
    });
    expect(edges).toContainEqual({
      kind: 'calls',
      sourceId: RENDER_SITE,
      targetId: WIDGET,
      rule: 'fake/renders',
      subKind: 'fake:renders',
      resolution: 'deterministic',
    });
    expect(edges).toContainEqual({
      kind: 'references',
      sourceId: RENDER_SITE,
      targetId: LABEL,
      rule: 'fake/binds',
      subKind: 'fake:prop',
      resolution: 'deterministic',
    });
  });

  it('emits one module-level dependency edge when a statement binds no symbol (ADR-0015 §11)', () => {
    const { document } = resolveProject([consumerFragment(), providerFragment()], [fakePlugin()]);

    const moduleEdges = resolveEdges(document).filter(
      (edge) => edge.rule === 'resolve/import-module',
    );
    // The Ghost import and the namespace import both depend on ./B → exactly one edge.
    expect(moduleEdges).toEqual([
      {
        kind: 'imports',
        sourceId: fileSymbolId(A),
        targetId: fileSymbolId(B),
        rule: 'resolve/import-module',
        subKind: undefined,
        resolution: 'deterministic',
      },
    ]);
  });

  it('records the honest tail and fabricates no edge for unknown or ambiguous modules', () => {
    const { document, diagnostics } = resolveProject(
      [consumerFragment(), providerFragment()],
      [fakePlugin()],
    );

    // Sorted by code (then specifier) for a deterministic tail.
    expect(diagnostics).toEqual([
      {
        code: 'ambiguous-module',
        importerFileId: fileSymbolId(A),
        specifier: './ambig',
        message: expect.any(String),
      },
      {
        // The module resolved but the export did not — attributed to the target
        // file and unbound name so a later "unused" view stays honest (C11).
        code: 'unresolved-export',
        importerFileId: fileSymbolId(A),
        specifier: './B',
        targetFileId: fileSymbolId(B),
        name: 'Ghost',
        message: expect.any(String),
      },
      {
        code: 'unresolved-module',
        importerFileId: fileSymbolId(A),
        specifier: './missing',
        message: expect.any(String),
      },
    ]);
    // The external relative import and the unknown module produce no edges.
    expect(
      resolveEdges(document).some(
        (edge) => edge.rule === 'resolve/import' && edge.targetId !== WIDGET,
      ),
    ).toBe(false);
  });

  it('is deterministic regardless of fragment order', () => {
    const forward = resolveProject([consumerFragment(), providerFragment()], [fakePlugin()]);
    const reversed = resolveProject([providerFragment(), consumerFragment()], [fakePlugin()]);
    expect(JSON.stringify(forward.document)).toBe(JSON.stringify(reversed.document));
    expect(JSON.stringify(forward.diagnostics)).toBe(JSON.stringify(reversed.diagnostics));
  });
});
