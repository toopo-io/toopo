import { type Edge, formatSymbolId, type SymbolId } from '@toopo/core';
import { describe, expect, it } from 'vitest';
import type {
  ExportIndex,
  ModuleIndex,
  ProjectModel,
  ResolverPlugin,
} from '../plugin/resolver-plugin.js';
import { applyWorkspaceSupersede, buildWorkspaceSupersede } from './workspace.js';

const CORE_ENTRY = 'packages/core/index.tsx';
const CORE_ENTRY_FILE = 'CoreEntry.';
const CORE_INTERNAL = 'CoreInternal.';

const externalCoreId = formatSymbolId({
  package: { manager: 'npm', name: '@toopo/core' },
  descriptors: [{ name: 'Core', suffix: 'term' }],
});
const externalReactId = formatSymbolId({
  package: { manager: 'npm', name: 'react' },
  descriptors: [{ name: 'useState', suffix: 'term' }],
});

function edge(kind: Edge['kind'], sourceId: SymbolId, targetId: SymbolId, subKind?: string): Edge {
  return {
    kind,
    sourceId,
    targetId,
    provenance: { pass: 'parse', rule: 'react/import-external' },
    resolution: 'deterministic',
    ...(subKind === undefined ? {} : { subKind }),
  };
}

const moduleIndex: ModuleIndex = {
  fileId: (path) => (path === CORE_ENTRY ? CORE_ENTRY_FILE : undefined),
};
const exportIndex: ExportIndex = { localExport: () => undefined, reExports: () => [] };
const plugin: ResolverPlugin = {
  id: 'fake',
  matches: () => true,
  resolveModule: () => ({ status: 'unresolved', reason: 'n/a' }),
  resolveExport: (request) =>
    request.fileId === CORE_ENTRY_FILE && request.exportedName === 'Core'
      ? { status: 'symbol', symbolId: CORE_INTERNAL, certainty: { resolution: 'deterministic' } }
      : { status: 'unresolved', reason: 'no export' },
  bindCallSite: () => [],
};

const project = (workspacePackages: ProjectModel['workspacePackages']): ProjectModel => ({
  aliases: [],
  workspacePackages,
});
const CORE_PKG = [{ name: '@toopo/core', entry: CORE_ENTRY }];

describe('workspace reclassification', () => {
  it('supersedes a bare workspace import with its internal symbol', () => {
    const supersede = buildWorkspaceSupersede(
      [edge('imports', 'App.', externalCoreId)],
      project(CORE_PKG),
      [plugin],
      moduleIndex,
      exportIndex,
    );
    expect(supersede.get(externalCoreId)).toEqual({
      internalId: CORE_INTERNAL,
      certainty: { resolution: 'deterministic' },
    });
  });

  it('leaves a non-workspace package and an unparsed entry external', () => {
    const supersede = buildWorkspaceSupersede(
      [edge('imports', 'App.', externalReactId), edge('imports', 'App.', externalCoreId)],
      project([{ name: '@toopo/core', entry: 'packages/core/missing.tsx' }]),
      [plugin],
      moduleIndex,
      exportIndex,
    );
    expect(supersede.size).toBe(0);
  });

  it('retargets the import edge and any call/render edge to the internal symbol', () => {
    const supersede = buildWorkspaceSupersede(
      [edge('imports', 'App.', externalCoreId)],
      project(CORE_PKG),
      [plugin],
      moduleIndex,
      exportIndex,
    );
    const rewritten = applyWorkspaceSupersede(
      [
        edge('imports', 'App.', externalCoreId),
        edge('calls', 'cs.', externalCoreId, 'react:renders'),
        edge('calls', 'cs2.', 'Other.'),
      ],
      supersede,
    );

    expect(rewritten).toContainEqual(
      expect.objectContaining({
        kind: 'imports',
        sourceId: 'App.',
        targetId: CORE_INTERNAL,
        provenance: { pass: 'resolve', rule: 'resolve/workspace' },
        resolution: 'deterministic',
      }),
    );
    expect(rewritten).toContainEqual(
      expect.objectContaining({
        kind: 'calls',
        sourceId: 'cs.',
        targetId: CORE_INTERNAL,
        subKind: 'react:renders',
        provenance: { pass: 'resolve', rule: 'resolve/workspace' },
      }),
    );
    // An unrelated edge is untouched.
    expect(rewritten).toContainEqual(
      expect.objectContaining({
        targetId: 'Other.',
        provenance: { pass: 'parse', rule: 'react/import-external' },
      }),
    );
  });

  it('is a no-op when there are no workspace packages', () => {
    const edges = [edge('imports', 'App.', externalCoreId)];
    expect(
      buildWorkspaceSupersede(edges, project([]), [plugin], moduleIndex, exportIndex).size,
    ).toBe(0);
    expect(applyWorkspaceSupersede(edges, new Map())).toEqual(edges);
  });
});
