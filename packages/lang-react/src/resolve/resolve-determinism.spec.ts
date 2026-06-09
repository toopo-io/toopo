import { readFile } from 'node:fs/promises';
import { createParser, type ParseResult } from '@toopo/parser';
import { type ProjectModel, resolveProject } from '@toopo/resolver';
import { describe, expect, it } from 'vitest';
import { createReactPlugin } from '../plugin';
import { createReactResolver } from './resolver';
import { buildAliasTable } from './tsconfig';

// A broad project touching every feature: relative, barrel, star, member-root,
// alias, workspace, and the honest tail (Missing/Partial).
const FILES: readonly { path: string; fixture: string }[] = [
  { path: 'src/App.tsx', fixture: 'App.tsx' },
  { path: 'src/Button.tsx', fixture: 'Button.tsx' },
  { path: 'src/Missing.tsx', fixture: 'Missing.tsx' },
  { path: 'src/Partial.tsx', fixture: 'Partial.tsx' },
  { path: 'src/Consumer.tsx', fixture: 'Consumer.tsx' },
  { path: 'src/ui/index.tsx', fixture: 'ui/index.tsx' },
  { path: 'src/ui/Button.tsx', fixture: 'ui/Button.tsx' },
  { path: 'src/StarConsumer.tsx', fixture: 'StarConsumer.tsx' },
  { path: 'src/all/index.tsx', fixture: 'all/index.tsx' },
  { path: 'src/all/Widget.tsx', fixture: 'all/Widget.tsx' },
  { path: 'src/MemberConsumer.tsx', fixture: 'MemberConsumer.tsx' },
  { path: 'src/Form.tsx', fixture: 'Form.tsx' },
  { path: 'src/AliasApp.tsx', fixture: 'AliasApp.tsx' },
  { path: 'src/WsApp.tsx', fixture: 'WsApp.tsx' },
  { path: 'packages/core/index.tsx', fixture: 'workspace/core-index.tsx' },
];

const project: ProjectModel = {
  aliases: buildAliasTable({ baseUrl: '.', paths: { '@/*': ['src/*'] } }, ''),
  workspacePackages: [{ name: '@toopo/core', entry: 'packages/core/index.tsx' }],
};

async function parseAll(): Promise<ParseResult[]> {
  const parser = createParser([createReactPlugin()]);
  const fragments: ParseResult[] = [];
  for (const file of FILES) {
    const bytes = await readFile(
      new URL(`../../test/fixtures/resolve/${file.fixture}`, import.meta.url),
    );
    fragments.push(await parser.parseFile({ path: file.path, bytes }));
  }
  return fragments;
}

/** Rotate an array by `n` (a different permutation than reverse). */
function rotate<T>(items: readonly T[], n: number): T[] {
  const offset = ((n % items.length) + items.length) % items.length;
  return [...items.slice(offset), ...items.slice(0, offset)];
}

describe('createReactResolver — Slice 6 byte-identical determinism', () => {
  it('produces an identical document and tail regardless of fragment order', async () => {
    const fragments = await parseAll();
    const resolve = (order: readonly ParseResult[]) =>
      resolveProject(order, [createReactResolver()], project);

    const canonical = resolve(fragments);
    for (const order of [[...fragments].reverse(), rotate(fragments, 5), rotate(fragments, 11)]) {
      const candidate = resolve(order);
      expect(JSON.stringify(candidate.document)).toBe(JSON.stringify(canonical.document));
      expect(JSON.stringify(candidate.diagnostics)).toBe(JSON.stringify(canonical.diagnostics));
    }
  });
});
