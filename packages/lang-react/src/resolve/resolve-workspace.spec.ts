import { readFile } from 'node:fs/promises';
import { composeCallSiteId, parseSymbolId } from '@toopo/core';
import { createParser, type ParseResult } from '@toopo/parser';
import { type ProjectModel, resolveProject } from '@toopo/resolver';
import { describe, expect, it } from 'vitest';
import { id, term } from '../../test/support/graph-helpers';
import { createReactPlugins } from '../plugin';
import { createReactResolver } from './resolver';

const FILES: readonly { path: string; fixture: string }[] = [
  { path: 'src/WsApp.tsx', fixture: 'WsApp.tsx' },
  { path: 'packages/core/index.tsx', fixture: 'workspace/core-index.tsx' },
];

async function parse(): Promise<ParseResult[]> {
  const parser = createParser(createReactPlugins());
  const fragments: ParseResult[] = [];
  for (const file of FILES) {
    const bytes = await readFile(
      new URL(`../../test/fixtures/resolve/${file.fixture}`, import.meta.url),
    );
    fragments.push(await parser.parseFile({ path: file.path, bytes }));
  }
  return fragments;
}

const project: ProjectModel = {
  aliases: [],
  workspacePackages: [{ name: '@toopo/core', entry: 'packages/core/index.tsx' }],
};

describe('createReactResolver — Slice 5 workspace-internal packages', () => {
  it('reclassifies a bare @toopo/core import to the internal symbol, superseding the external edge', () => {
    return parse().then((fragments) => {
      const { document } = resolveProject(fragments, [createReactResolver()], project);
      const coreId = id('packages/core/index.tsx', term('Core'));

      // The import now points at core's internal Core symbol, under a resolve provenance.
      expect(document.edges).toContainEqual(
        expect.objectContaining({
          kind: 'imports',
          sourceId: id('src/WsApp.tsx'),
          targetId: coreId,
          provenance: { pass: 'resolve', rule: 'resolve/workspace' },
          resolution: 'deterministic',
        }),
      );
      // The <Core/> render followed to the internal symbol too.
      const site = composeCallSiteId({
        enclosingSymbolId: id('src/WsApp.tsx', term('WsApp')),
        calleeReference: 'Core',
        ordinal: 0,
      });
      expect(document.edges).toContainEqual(
        expect.objectContaining({
          kind: 'calls',
          sourceId: site,
          targetId: coreId,
          subKind: 'react:renders',
          provenance: { pass: 'resolve', rule: 'resolve/workspace' },
        }),
      );
      // No edge still targets the provisional external @toopo/core coordinate.
      const stillExternal = document.edges.some((edge) => {
        try {
          return parseSymbolId(edge.targetId).package?.name === '@toopo/core';
        } catch {
          return false;
        }
      });
      expect(stillExternal).toBe(false);
    });
  });

  it('without the workspace map the import stays external (parser default)', async () => {
    const fragments = await parse();
    const { document } = resolveProject(fragments, [createReactResolver()]);
    const stillExternal = document.edges.some((edge) => {
      try {
        return parseSymbolId(edge.targetId).package?.name === '@toopo/core';
      } catch {
        return false;
      }
    });
    expect(stillExternal).toBe(true);
  });
});
