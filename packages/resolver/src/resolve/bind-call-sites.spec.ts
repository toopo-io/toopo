import type { CallSiteNode, FileNode, SymbolId } from '@toopo/core';
import { describe, expect, it } from 'vitest';
import type {
  NamespaceImports,
  ResolvedImport,
  ResolverPlugin,
  UnresolvedUsage,
} from '../plugin/resolver-plugin.js';
import type { SymbolGraph } from '../project/symbol-graph.js';
import { bindFileCallSites } from './bind-call-sites.js';

/**
 * Direct coverage of the engine's usage→diagnostic mapping (ADR-0016 C11): the
 * anchored verdict and BOTH anchorless paths (root absent, and root present but
 * outside the graph) are decided purely from `rootSymbolId` + `fileOf`, never from
 * the plugin's `reason`. A stub `SymbolGraph` controls `fileOf` so all three are
 * exercised in isolation.
 */
const IMPORTER: SymbolId = 'consumer.';
const PROVIDER: SymbolId = 'provider.';
const ROOT_SYMBOL: SymbolId = 'provider.Widget.';
const EXTERNAL_SYMBOL: SymbolId = 'npm:lib/Widget.';

const file = {
  kind: 'file',
  id: IMPORTER,
  path: 'src/app.tsx',
  contentHash: 'h',
  properties: {},
} as FileNode;

/** One value import so `bindFileCallSites` does not short-circuit on an empty file. */
const resolvedImports = new Map<string, ResolvedImport>([
  ['Widget', { symbolId: ROOT_SYMBOL, certainty: { resolution: 'deterministic' } }],
]);
const noNamespaces: NamespaceImports = {
  size: 0,
  resolveMember: () => ({ status: 'not-namespace' }),
};

function callSiteNode(): CallSiteNode {
  return {
    kind: 'callSite',
    id: 'cs.',
    enclosingSymbolId: 'App.',
    callee: 'Widget.draw',
    ordinal: 0,
    subKind: undefined,
    payload: [],
    properties: {},
  };
}

/** A plugin that echoes a single preconfigured usage and mints no edge. */
function usagePlugin(usage: UnresolvedUsage): ResolverPlugin {
  return {
    id: 'fake',
    matches: () => true,
    resolveModule: () => ({ status: 'unresolved', reason: 'n/a' }),
    resolveExport: () => ({ status: 'unresolved', reason: 'n/a' }),
    bindCallSite: () => ({ edges: [], unresolved: [usage] }),
  };
}

/** A SymbolGraph stub: one unbound call-site, a controllable `fileOf`. */
function stubGraph(fileOf: (id: SymbolId) => SymbolId | undefined): SymbolGraph {
  return {
    symbolView: { declaredChildren: () => [] },
    callSitesOfFile: () => [callSiteNode()],
    isBound: () => false,
    fileOf,
  };
}

function mapUsage(usage: UnresolvedUsage, fileOf: (id: SymbolId) => SymbolId | undefined) {
  const { diagnostics } = bindFileCallSites(
    file,
    usagePlugin(usage),
    resolvedImports,
    noNamespaces,
    stubGraph(fileOf),
  );
  expect(diagnostics).toHaveLength(1);
  return diagnostics[0];
}

describe('bindFileCallSites — usageDiagnostic mapping (C11)', () => {
  it('anchors a usage whose root resolves to an in-graph file', () => {
    const diagnostic = mapUsage(
      { reason: 'member-root', callee: 'Widget.draw', member: 'draw', rootSymbolId: ROOT_SYMBOL },
      (id) => (id === ROOT_SYMBOL ? PROVIDER : undefined),
    );
    expect(diagnostic).toEqual({
      code: 'unresolved-member',
      importerFileId: IMPORTER,
      specifier: 'Widget.draw',
      targetFileId: PROVIDER,
      name: 'draw',
      message: expect.any(String),
    });
  });

  it('records an anchorless gap when the usage carries no root (a local/param root)', () => {
    const diagnostic = mapUsage(
      { reason: 'unbound-root', callee: 'handler.run', member: 'run' },
      () => {
        throw new Error('fileOf must not be called for an absent root');
      },
    );
    expect(diagnostic).toEqual({
      code: 'unbound-callee',
      importerFileId: IMPORTER,
      specifier: 'handler.run',
      name: 'run',
      message: expect.any(String),
    });
    expect(diagnostic).not.toHaveProperty('targetFileId');
  });

  it('records an anchorless gap when a present root resolves outside the graph (fileOf undefined)', () => {
    // The root is a real symbol but external (no parsed file) — name-only narrowing is
    // the honest result, identical to a genuinely anchorless gap. Never a third code.
    const diagnostic = mapUsage(
      {
        reason: 'member-root',
        callee: 'Widget.draw',
        member: 'draw',
        rootSymbolId: EXTERNAL_SYMBOL,
      },
      () => undefined,
    );
    expect(diagnostic).toEqual({
      code: 'unbound-callee',
      importerFileId: IMPORTER,
      specifier: 'Widget.draw',
      name: 'draw',
      message: expect.any(String),
    });
    expect(diagnostic).not.toHaveProperty('targetFileId');
  });
});
