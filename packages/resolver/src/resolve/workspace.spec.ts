import { type Edge, formatSymbolId, type SymbolId } from '@toopo/core';
import type { ExternalImport } from '@toopo/parser';
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
const UI_BUTTON_SOURCE = 'packages/ui/src/components/button.tsx';
const UI_BUTTON_FILE = 'UiButton.';
const UI_BUTTON_INTERNAL = 'ButtonInternal.';

const externalCoreId = formatSymbolId({
  package: { manager: 'npm', name: '@toopo/core' },
  descriptors: [{ name: 'Core', suffix: 'term' }],
});
const externalUiButtonId = formatSymbolId({
  package: { manager: 'npm', name: '@toopo/ui' },
  descriptors: [{ name: 'Button', suffix: 'term' }],
});

/** An external-import record (bare or subpath) the parser preserves. */
function extImport(packageName: string, name: string, subpath = ''): ExternalImport {
  return {
    importerFileId: 'App.',
    packageName,
    subpath,
    imported: [{ name, localName: name, kind: 'named', typeOnly: false }],
  };
}

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
  fileId: (path) =>
    path === CORE_ENTRY ? CORE_ENTRY_FILE : path === UI_BUTTON_SOURCE ? UI_BUTTON_FILE : undefined,
};
const exportIndex: ExportIndex = { localExport: () => undefined, reExports: () => [] };
const plugin: ResolverPlugin = {
  id: 'fake',
  matches: () => true,
  resolveModule: () => ({ status: 'unresolved', reason: 'n/a' }),
  resolveExport: (request) => {
    if (request.fileId === CORE_ENTRY_FILE && request.exportedName === 'Core') {
      return {
        status: 'symbol',
        symbolId: CORE_INTERNAL,
        certainty: { resolution: 'deterministic' },
      };
    }
    if (request.fileId === UI_BUTTON_FILE && request.exportedName === 'Button') {
      return {
        status: 'symbol',
        symbolId: UI_BUTTON_INTERNAL,
        certainty: { resolution: 'deterministic' },
      };
    }
    return { status: 'unresolved', reason: 'no export' };
  },
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
      [extImport('@toopo/core', 'Core')],
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

  it('supersedes a subpath import via the package exports map (Fix C2)', () => {
    const supersede = buildWorkspaceSupersede(
      [extImport('@toopo/ui', 'Button', 'components/button')],
      project([
        {
          name: '@toopo/ui',
          subpathExports: [{ subpath: 'components/button', entry: UI_BUTTON_SOURCE }],
        },
      ]),
      [plugin],
      moduleIndex,
      exportIndex,
    );
    expect(supersede.get(externalUiButtonId)).toEqual({
      internalId: UI_BUTTON_INTERNAL,
      certainty: { resolution: 'deterministic' },
    });
  });

  it('leaves an unknown subpath external', () => {
    const supersede = buildWorkspaceSupersede(
      [extImport('@toopo/ui', 'Button', 'components/missing')],
      project([
        {
          name: '@toopo/ui',
          subpathExports: [{ subpath: 'components/button', entry: UI_BUTTON_SOURCE }],
        },
      ]),
      [plugin],
      moduleIndex,
      exportIndex,
    );
    expect(supersede.size).toBe(0);
  });

  it('leaves a non-workspace package and an unparsed entry external', () => {
    const supersede = buildWorkspaceSupersede(
      [extImport('react', 'useState'), extImport('@toopo/core', 'Core')],
      project([{ name: '@toopo/core', entry: 'packages/core/missing.tsx' }]),
      [plugin],
      moduleIndex,
      exportIndex,
    );
    expect(supersede.size).toBe(0);
  });

  it('retargets the import edge and any call/render edge to the internal symbol', () => {
    const supersede = buildWorkspaceSupersede(
      [extImport('@toopo/core', 'Core')],
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
    expect(
      buildWorkspaceSupersede(
        [extImport('@toopo/core', 'Core')],
        project([]),
        [plugin],
        moduleIndex,
        exportIndex,
      ).size,
    ).toBe(0);
    const edges = [edge('imports', 'App.', externalCoreId)];
    expect(applyWorkspaceSupersede(edges, new Map())).toEqual(edges);
  });
});
