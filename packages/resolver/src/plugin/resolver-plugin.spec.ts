import { describe, expect, it } from 'vitest';
import type { ExportResolution, ModuleResolution, ResolverPlugin } from './resolver-plugin.js';

/**
 * A fake plugin proving the contract composes and the outcome unions narrow as
 * intended. The engine consumes these exact shapes; this locks the trust
 * discriminator (a `deterministic` outcome carries no confidence, an `inferred`
 * one requires it) at the type and runtime level.
 */
const fakePlugin: ResolverPlugin = {
  id: 'fake',
  matches: (file) => file.path.endsWith('.tsx'),
  resolveModule: (request) =>
    request.specifier.startsWith('.')
      ? { status: 'internal', fileId: 'F.', certainty: { resolution: 'deterministic' } }
      : { status: 'external', coordinate: { manager: 'npm', name: request.specifier } },
  resolveExport: (request) => ({
    status: 'symbol',
    symbolId: `${request.fileId}${request.exportedName}.`,
    certainty: { resolution: 'inferred', confidence: 'high' },
  }),
  bindCallSite: (callSite, resolvedImports) => {
    const resolved = resolvedImports.get(callSite.callee);
    if (resolved === undefined) {
      return [];
    }
    return [
      {
        kind: 'calls',
        sourceId: callSite.callSiteId,
        targetId: resolved.symbolId,
        rule: 'fake/binds',
        ...(callSite.subKind === undefined ? {} : { subKind: 'fake:renders' }),
        certainty: resolved.certainty,
      },
    ];
  },
};

describe('ResolverPlugin contract', () => {
  it('matches files by the plugin rule', () => {
    expect(fakePlugin.matches({ path: 'src/App.tsx' })).toBe(true);
    expect(fakePlugin.matches({ path: 'src/data.json' })).toBe(false);
  });

  it('produces an internal, deterministic module resolution for a relative specifier', () => {
    const outcome: ModuleResolution = fakePlugin.resolveModule(
      { specifier: './Button', importerPath: 'src/App.tsx', importerFileId: 'A.', typeOnly: false },
      { fileId: () => undefined },
    );

    expect(outcome.status).toBe('internal');
    if (outcome.status === 'internal') {
      expect(outcome.certainty.resolution).toBe('deterministic');
      // A deterministic certainty structurally carries no confidence.
      expect('confidence' in outcome.certainty).toBe(false);
    }
  });

  it('produces an external module resolution for a bare specifier', () => {
    const outcome = fakePlugin.resolveModule(
      { specifier: 'react', importerPath: 'src/App.tsx', importerFileId: 'A.', typeOnly: false },
      { fileId: () => undefined },
    );

    expect(outcome).toEqual({ status: 'external', coordinate: { manager: 'npm', name: 'react' } });
  });

  it('carries confidence on an inferred export resolution', () => {
    const outcome: ExportResolution = fakePlugin.resolveExport(
      { fileId: 'F.', exportedName: 'Button', typeOnly: false },
      { localExport: () => undefined },
    );

    expect(outcome.status).toBe('symbol');
    if (outcome.status === 'symbol' && outcome.certainty.resolution === 'inferred') {
      expect(outcome.certainty.confidence).toBe('high');
    }
  });

  it('binds a deferred call-site to its resolved import, propagating certainty', () => {
    const resolvedImports = new Map([
      ['Button', { symbolId: 'B.', certainty: { resolution: 'deterministic' as const } }],
    ]);
    const noChildren = { declaredChildren: () => [] };
    const noNamespaces = { size: 0, resolveMember: () => null };

    const renderEdges = fakePlugin.bindCallSite(
      { callSiteId: 'cs.', callee: 'Button', subKind: 'x:element', payload: [] },
      resolvedImports,
      noNamespaces,
      noChildren,
    );
    expect(renderEdges).toEqual([
      {
        kind: 'calls',
        sourceId: 'cs.',
        targetId: 'B.',
        rule: 'fake/binds',
        subKind: 'fake:renders',
        certainty: { resolution: 'deterministic' },
      },
    ]);

    // A callee with no resolved import yields no edge.
    expect(
      fakePlugin.bindCallSite(
        { callSiteId: 'cs.', callee: 'Unknown', subKind: undefined, payload: [] },
        resolvedImports,
        noNamespaces,
        noChildren,
      ),
    ).toEqual([]);
  });
});
