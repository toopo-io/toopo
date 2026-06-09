import { readFile } from 'node:fs/promises';
import { composeCallSiteId } from '@toopo/core';
import { createParser, type ParseResult } from '@toopo/parser';
import { type ProjectModel, resolveProject } from '@toopo/resolver';
import { describe, expect, it } from 'vitest';
import { id, term } from '../../test/support/graph-helpers';
import { createReactPlugins } from '../plugin';
import { createReactResolver } from './resolver';
import { buildAliasTable } from './tsconfig';

const FILES: readonly { path: string; fixture: string }[] = [
  { path: 'src/AliasApp.tsx', fixture: 'AliasApp.tsx' },
  { path: 'src/Button.tsx', fixture: 'Button.tsx' },
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

describe('createReactResolver — Slice 4 tsconfig alias resolution', () => {
  it('resolves an `@/` import via a tsconfig paths table built from raw config', () => {
    const aliases = buildAliasTable({ baseUrl: '.', paths: { '@/*': ['src/*'] } }, '');
    const project: ProjectModel = { aliases, workspacePackages: [] };

    return parse().then((fragments) => {
      const { document } = resolveProject(fragments, [createReactResolver()], project);
      const edges = document.edges.filter((edge) => edge.provenance.pass === 'resolve');
      const buttonId = id('src/Button.tsx', term('Button'));

      // The aliased import binds to the real Button symbol, deterministically.
      expect(edges).toContainEqual(
        expect.objectContaining({
          kind: 'imports',
          sourceId: id('src/AliasApp.tsx'),
          targetId: buttonId,
          resolution: 'deterministic',
        }),
      );
      // …and the deferred render binds across files too.
      const site = composeCallSiteId({
        enclosingSymbolId: id('src/AliasApp.tsx', term('AliasApp')),
        calleeReference: 'Button',
        ordinal: 0,
      });
      expect(edges).toContainEqual(
        expect.objectContaining({
          kind: 'calls',
          sourceId: site,
          targetId: buttonId,
          subKind: 'react:renders',
          resolution: 'deterministic',
        }),
      );
    });
  });

  it('without the alias table the same import is unresolved (no fabricated edge)', async () => {
    const fragments = await parse();
    const { document, diagnostics } = resolveProject(fragments, [createReactResolver()]);
    const aliasEdges = document.edges.filter(
      (edge) => edge.provenance.pass === 'resolve' && edge.sourceId === id('src/AliasApp.tsx'),
    );
    expect(aliasEdges).toEqual([]);
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: 'unresolved-module', specifier: '@/Button' }),
    );
  });
});
