import {
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
import type { ResolverPlugin, UnresolvedUsage } from '../plugin/resolver-plugin.js';
import { resolveProject } from './resolve-project.js';

// --- id helpers (mirror the parser's minting) -------------------------------
const term = (name: string): Descriptor => ({ name, suffix: 'term' });
function path(file: string, ...descriptors: Descriptor[]): SymbolId {
  const base = fileIdentity(file);
  return formatSymbolId({ ...base, descriptors: [...base.descriptors, ...descriptors] });
}

const PROVIDER = 'src/widget.tsx';
const CONSUMER = 'src/app.tsx';
const WIDGET = path(PROVIDER, term('Widget'));
const APP = path(CONSUMER, term('App'));

/** A call-site id for a member-root callee enclosed in `App`. */
function callSiteId(callee: string, ordinal: number): SymbolId {
  return composeCallSiteId({ enclosingSymbolId: APP, calleeReference: callee, ordinal });
}

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

function callSiteNode(callee: string, ordinal: number): Node {
  return {
    kind: 'callSite',
    id: callSiteId(callee, ordinal),
    enclosingSymbolId: APP,
    callee,
    ordinal,
    subKind: undefined,
    payload: [],
    properties: {},
  };
}

/** Provider module defining and exporting `Widget`. */
function providerFragment(): ParseResult {
  const document: GraphDocument = {
    formatVersion: FORMAT_VERSION,
    nodes: [fileNode(PROVIDER), symbolNode(WIDGET, 'Widget', 'react:component')],
    edges: [containsEdge(fileSymbolId(PROVIDER), WIDGET, 'react/contains-symbol')],
  };
  return {
    document,
    unresolved: [],
    exports: [
      {
        exporterFileId: fileSymbolId(PROVIDER),
        exportedName: 'Widget',
        symbolId: WIDGET,
        typeOnly: false,
      },
    ],
    reExports: [],
  };
}

/**
 * Consumer importing `Widget` and using it via two member-root call-sites: an
 * ANCHORED one (`Widget.draw` — the root resolves to the provider) and an
 * ANCHORLESS one (`local.run` — the root is not an import).
 */
function consumerFragment(): ParseResult {
  const anchored = callSiteNode('Widget.draw', 0);
  const anchorless = callSiteNode('local.run', 0);
  const document: GraphDocument = {
    formatVersion: FORMAT_VERSION,
    nodes: [fileNode(CONSUMER), symbolNode(APP, 'App', 'react:component'), anchored, anchorless],
    edges: [
      containsEdge(fileSymbolId(CONSUMER), APP, 'react/contains-symbol'),
      containsEdge(APP, anchored.id, 'react/contains-callsite'),
      containsEdge(APP, anchorless.id, 'react/contains-callsite'),
    ],
  };
  return {
    document,
    unresolved: [
      {
        importerFileId: fileSymbolId(CONSUMER),
        importerPath: CONSUMER,
        specifier: './widget',
        imported: [{ name: 'Widget', localName: 'Widget', kind: 'named', typeOnly: false }],
        typeOnly: false,
        location: { startRow: 0, startColumn: 0, endRow: 0, endColumn: 1 },
      },
    ],
    exports: [],
    reExports: [],
  };
}

/** A plugin that resolves `./widget` → provider, binds `Widget` exactly, and emits
 * a member-root root edge plus the unresolved member usage (the contract under test). */
function memberRootPlugin(): ResolverPlugin {
  return {
    id: 'fake',
    matches: (file) => file.path.endsWith('.tsx'),
    resolveModule: (request) =>
      request.specifier === './widget'
        ? {
            status: 'internal',
            fileId: fileSymbolId(PROVIDER),
            certainty: { resolution: 'deterministic' },
          }
        : { status: 'unresolved', reason: `no file for ${request.specifier}` },
    resolveExport: (request) =>
      request.exportedName === 'Widget'
        ? { status: 'symbol', symbolId: WIDGET, certainty: { resolution: 'deterministic' } }
        : { status: 'unresolved', reason: `no export ${request.exportedName}` },
    bindCallSite: (callSite, resolvedImports) => {
      const dot = callSite.callee.indexOf('.');
      const root = callSite.callee.slice(0, dot);
      const member = callSite.callee.slice(dot + 1);
      const resolved = resolvedImports.get(root);
      if (resolved === undefined) {
        const usage: UnresolvedUsage = { reason: 'unbound-root', callee: callSite.callee, member };
        return { edges: [], unresolved: [usage] };
      }
      const usage: UnresolvedUsage = {
        reason: 'member-root',
        callee: callSite.callee,
        member,
        rootSymbolId: resolved.symbolId,
      };
      return {
        edges: [
          {
            kind: 'calls',
            sourceId: callSite.callSiteId,
            targetId: resolved.symbolId,
            rule: 'fake/calls-member-root',
            subKind: 'fake:memberRoot',
            certainty: { resolution: 'inferred', confidence: 'medium' },
          },
        ],
        unresolved: [usage],
      };
    },
  };
}

describe('resolveProject — C11 call-site usage tail', () => {
  it('anchors a member-root member to its resolved root file, and records an anchorless gap by name', () => {
    const { diagnostics } = resolveProject(
      [consumerFragment(), providerFragment()],
      [memberRootPlugin()],
    );

    expect(diagnostics).toEqual([
      // Anchorless: the root `local` is no import, so no targetFileId — name only.
      {
        code: 'unbound-callee',
        importerFileId: fileSymbolId(CONSUMER),
        specifier: 'local.run',
        name: 'run',
        message: expect.any(String),
      },
      // Anchored: `Widget` resolved to the provider, so the gap targets that file.
      {
        code: 'unresolved-member',
        importerFileId: fileSymbolId(CONSUMER),
        specifier: 'Widget.draw',
        targetFileId: fileSymbolId(PROVIDER),
        name: 'draw',
        message: expect.any(String),
      },
    ]);
  });

  it('still mints the member-root edge to the resolved root (the gap never replaces the edge)', () => {
    const { document } = resolveProject(
      [consumerFragment(), providerFragment()],
      [memberRootPlugin()],
    );
    const rootEdge = document.edges.find(
      (edge) => edge.provenance.rule === 'fake/calls-member-root',
    );
    expect(rootEdge).toMatchObject({
      kind: 'calls',
      sourceId: callSiteId('Widget.draw', 0),
      targetId: WIDGET,
      resolution: 'inferred',
    });
  });

  it('is deterministic regardless of fragment order (codes + collapsed rows, byte-identical)', () => {
    const forward = resolveProject([consumerFragment(), providerFragment()], [memberRootPlugin()]);
    const reversed = resolveProject([providerFragment(), consumerFragment()], [memberRootPlugin()]);
    expect(JSON.stringify(forward.diagnostics)).toBe(JSON.stringify(reversed.diagnostics));
  });
});
