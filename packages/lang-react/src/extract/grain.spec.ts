import { readFile } from 'node:fs/promises';
import { isSymbolNode } from '@toopo/core';
import { createParser } from '@toopo/parser';
import { describe, expect, it } from 'vitest';
import { createReactPlugins } from '../plugin';

const FIXTURE = new URL('../../test/fixtures/Grain.tsx', import.meta.url);

async function symbols() {
  const parser = createParser(createReactPlugins());
  const { document } = await parser.parseFile({
    path: 'src/Grain.tsx',
    bytes: await readFile(FIXTURE),
  });
  return document;
}

function subKindOf(
  nodes: ReturnType<typeof Array.prototype.filter>,
  name: string,
): string | undefined {
  return nodes.find((node: { name: string }) => node.name === name)?.subKind;
}

describe('symbol grain (Fix B)', () => {
  it('extracts value consts as ts:variable', async () => {
    const top = (await symbols()).nodes.filter(isSymbolNode);
    expect(subKindOf(top, 'siteConfig')).toBe('ts:variable');
    expect(subKindOf(top, 'answer')).toBe('ts:variable');
  });

  it('extracts type aliases and interfaces', async () => {
    const top = (await symbols()).nodes.filter(isSymbolNode);
    expect(subKindOf(top, 'Mode')).toBe('ts:type');
    expect(subKindOf(top, 'Props')).toBe('ts:interface');
  });

  it('recognizes forwardRef and memo(forwardRef) as components', async () => {
    const top = (await symbols()).nodes.filter(isSymbolNode);
    expect(subKindOf(top, 'Boxed')).toBe('react:component');
    expect(subKindOf(top, 'Both')).toBe('react:component');
  });

  it('keeps an unknown HOC as a value, never a guessed component', async () => {
    const top = (await symbols()).nodes.filter(isSymbolNode);
    expect(subKindOf(top, 'Decorated')).toBe('ts:variable');
  });

  it('extracts classes and their extends/implements edges', async () => {
    const document = await symbols();
    const symbolNodes = document.nodes.filter(isSymbolNode);
    expect(subKindOf(symbolNodes, 'Service')).toBe('ts:class');
    expect(subKindOf(symbolNodes, 'LocalBase')).toBe('ts:class');

    const service = symbolNodes.find((node) => node.name === 'Service');
    const localBase = symbolNodes.find((node) => node.name === 'LocalBase');
    // extends → the in-file LocalBase symbol (deterministic local edge).
    expect(document.edges).toContainEqual(
      expect.objectContaining({ kind: 'extends', sourceId: service?.id, targetId: localBase?.id }),
    );
    // implements → the external Mixin binding (edge to an external coordinate).
    expect(
      document.edges.some((edge) => edge.kind === 'implements' && edge.sourceId === service?.id),
    ).toBe(true);
  });

  it('handles extends-only and generic global supertypes as classes', async () => {
    const top = (await symbols()).nodes.filter(isSymbolNode);
    expect(subKindOf(top, 'OnlyExtends')).toBe('ts:class');
    expect(subKindOf(top, 'Listy')).toBe('ts:class');
  });

  it('skips a destructuring declarator (no single stable identity)', async () => {
    const names = (await symbols()).nodes.filter(isSymbolNode).map((node) => node.name);
    expect(names).not.toContain('nestedName');
  });

  it('still classifies a hook by name', async () => {
    const top = (await symbols()).nodes.filter(isSymbolNode);
    expect(subKindOf(top, 'useThing')).toBe('react:hook');
  });
});
