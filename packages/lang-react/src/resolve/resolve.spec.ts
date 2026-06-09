import { readFile } from 'node:fs/promises';
import { composeCallSiteId, GraphDocumentSchema } from '@toopo/core';
import { createParser, type ParseResult } from '@toopo/parser';
import { resolveProject } from '@toopo/resolver';
import { describe, expect, it } from 'vitest';
import { id, param, term } from '../../test/support/graph-helpers';
import { createReactPlugin } from '../plugin';
import { createReactResolver } from './resolver';

interface ProjectFile {
  readonly path: string;
  readonly fixture: string;
}

const PROJECT: readonly ProjectFile[] = [
  { path: 'src/App.tsx', fixture: 'App.tsx' },
  { path: 'src/Button.tsx', fixture: 'Button.tsx' },
  { path: 'src/Missing.tsx', fixture: 'Missing.tsx' },
  { path: 'src/Partial.tsx', fixture: 'Partial.tsx' },
];

async function parseProject(files: readonly ProjectFile[]): Promise<ParseResult[]> {
  const parser = createParser([createReactPlugin()]);
  const fragments: ParseResult[] = [];
  for (const file of files) {
    const bytes = await readFile(
      new URL(`../../test/fixtures/resolve/${file.fixture}`, import.meta.url),
    );
    fragments.push(await parser.parseFile({ path: file.path, bytes }));
  }
  return fragments;
}

function resolveEdges(document: ReturnType<typeof GraphDocumentSchema.parse>) {
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

const buttonId = id('src/Button.tsx', term('Button'));
const labelPropId = id('src/Button.tsx', term('Button'), param('label'));
const renderSiteId = composeCallSiteId({
  enclosingSymbolId: id('src/App.tsx', term('App')),
  calleeReference: 'Button',
  ordinal: 0,
});

describe('createReactResolver — Slice 2 cross-file binding', () => {
  it('binds a relative import, its render edge, and its prop across files', async () => {
    const fragments = await parseProject(PROJECT);
    const { document } = resolveProject(fragments, [createReactResolver()]);
    expect(GraphDocumentSchema.safeParse(document).success).toBe(true);

    const edges = resolveEdges(document);

    // The relative import './Button' binds to the real exported Button symbol.
    expect(edges).toContainEqual({
      kind: 'imports',
      sourceId: id('src/App.tsx'),
      targetId: buttonId,
      rule: 'resolve/import',
      subKind: undefined,
      resolution: 'deterministic',
    });
    // The deferred <Button/> render now points at Button, deterministically.
    expect(edges).toContainEqual({
      kind: 'calls',
      sourceId: renderSiteId,
      targetId: buttonId,
      rule: 'react/renders-import',
      subKind: 'react:renders',
      resolution: 'deterministic',
    });
    // "App passes label to Button" — the cross-file prop binding.
    expect(edges).toContainEqual({
      kind: 'references',
      sourceId: renderSiteId,
      targetId: labelPropId,
      rule: 'react/binds-prop',
      subKind: 'react:propBinding',
      resolution: 'deterministic',
    });
  });

  it('records the honest tail: unknown module → no edge, missing export → module-level edge', async () => {
    const fragments = await parseProject(PROJECT);
    const { document, diagnostics } = resolveProject(fragments, [createReactResolver()]);

    // Missing.tsx imports ./Nowhere (no parsed file) and Partial.tsx imports a
    // name Button.tsx does not export — both surfaced, neither fabricated.
    expect(diagnostics).toEqual([
      {
        code: 'unresolved-module',
        importerFileId: id('src/Missing.tsx'),
        specifier: './Nowhere',
        message: expect.any(String),
      },
      {
        code: 'unresolved-export',
        importerFileId: id('src/Partial.tsx'),
        specifier: './Button',
        message: expect.any(String),
      },
    ]);

    // The unresolvable module gets no edge at all.
    const goneSite = composeCallSiteId({
      enclosingSymbolId: id('src/Missing.tsx', term('Missing')),
      calleeReference: 'Gone',
      ordinal: 0,
    });
    expect(document.edges.some((edge) => edge.sourceId === goneSite)).toBe(false);

    // The resolvable-but-unexported import still records the real dependency.
    expect(resolveEdges(document)).toContainEqual({
      kind: 'imports',
      sourceId: id('src/Partial.tsx'),
      targetId: id('src/Button.tsx'),
      rule: 'resolve/import-module',
      subKind: undefined,
      resolution: 'deterministic',
    });
  });

  it('is deterministic regardless of fragment order', async () => {
    const fragments = await parseProject(PROJECT);
    const forward = resolveProject(fragments, [createReactResolver()]);
    const reversed = resolveProject([...fragments].reverse(), [createReactResolver()]);
    expect(JSON.stringify(forward.document)).toBe(JSON.stringify(reversed.document));
    expect(JSON.stringify(forward.diagnostics)).toBe(JSON.stringify(reversed.diagnostics));
  });
});
