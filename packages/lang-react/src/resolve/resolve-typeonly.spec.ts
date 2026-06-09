import { readFile } from 'node:fs/promises';
import { isCallSiteNode } from '@toopo/core';
import { createParser, type ParseResult } from '@toopo/parser';
import { resolveProject } from '@toopo/resolver';
import { describe, expect, it } from 'vitest';
import { id, term } from '../../test/support/graph-helpers';
import { createReactPlugin } from '../plugin';
import { createReactResolver } from './resolver';

const FILES: readonly { path: string; fixture: string }[] = [
  { path: 'src/TypeApp.tsx', fixture: 'TypeApp.tsx' },
  { path: 'src/Button.tsx', fixture: 'Button.tsx' },
  { path: 'src/theme.tsx', fixture: 'theme.tsx' },
];

async function resolve() {
  const parser = createParser([createReactPlugin()]);
  const fragments: ParseResult[] = [];
  for (const file of FILES) {
    const bytes = await readFile(
      new URL(`../../test/fixtures/resolve/${file.fixture}`, import.meta.url),
    );
    fragments.push(await parser.parseFile({ path: file.path, bytes }));
  }
  return resolveProject(fragments, [createReactResolver()]);
}

describe('createReactResolver — Slice 6 import type and determinism', () => {
  it('treats `import type` as a module-level dependency with no render/call target', async () => {
    const { document } = await resolve();
    const resolveEdges = document.edges.filter((edge) => edge.provenance.pass === 'resolve');

    // The type-only import records the dependency on ./theme at module level only.
    expect(resolveEdges).toContainEqual(
      expect.objectContaining({
        kind: 'imports',
        sourceId: id('src/TypeApp.tsx'),
        targetId: id('src/theme.tsx'),
        provenance: { pass: 'resolve', rule: 'resolve/import-module' },
      }),
    );
    // ./theme exports no value symbol, so nothing targets a Theme symbol, and the
    // type import spawns no calls/references edge.
    expect(
      resolveEdges.some((edge) => edge.kind === 'calls' && edge.targetId.includes('theme')),
    ).toBe(false);
    expect(
      resolveEdges.some((edge) => edge.kind === 'references' && edge.targetId.includes('theme')),
    ).toBe(false);

    // The value import still binds normally (the render targets Button).
    expect(resolveEdges).toContainEqual(
      expect.objectContaining({
        kind: 'calls',
        targetId: id('src/Button.tsx', term('Button')),
        subKind: 'react:renders',
      }),
    );

    // Sanity: the only call-site is the <Button/> render — `Theme` never became one.
    const callSiteCallees = document.nodes.filter(isCallSiteNode).map((node) => node.callee);
    expect(callSiteCallees).toEqual(['Button']);
  });
});
