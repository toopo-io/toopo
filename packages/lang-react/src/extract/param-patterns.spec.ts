import { GraphDocumentSchema, isSymbolNode } from '@toopo/core';
import { createParser } from '@toopo/parser';
import { describe, expect, it } from 'vitest';
import { id, param, term } from '../../test/support/graph-helpers';
import { createReactPlugins } from '../plugin';

async function parse(path: string, source: string) {
  const parser = createParser(createReactPlugins());
  const { document } = await parser.parseFile({ path, bytes: Buffer.from(source) });
  expect(GraphDocumentSchema.safeParse(document).success).toBe(true);
  return document;
}

const PATH = 'src/Params.tsx';

function childNames(document: Awaited<ReturnType<typeof parse>>, parentId: string): string[] {
  const childIds = new Set(
    document.edges
      .filter((edge) => edge.kind === 'contains' && edge.sourceId === parentId)
      .map((edge) => edge.targetId),
  );
  return document.nodes
    .filter(isSymbolNode)
    .filter((node) => childIds.has(node.id))
    .map((node) => node.name)
    .sort();
}

describe('parameter pattern extraction (A1 / C6)', () => {
  it('captures renamed, defaulted, and rest object-pattern fields by their public key', async () => {
    const document = await parse(
      PATH,
      `function build({ a, b: bb, c = 1, ...others }: Opts): number { return 0; }`,
    );
    // Renamed `b: bb` is addressed by the public key `b`, never the local alias `bb`.
    expect(childNames(document, id(PATH, term('build')))).toEqual(['a', 'b', 'c', 'others']);
    expect(document.nodes.filter(isSymbolNode).map((node) => node.name)).not.toContain('bb');
  });

  it('captures top-level rest params and array-pattern element bindings', async () => {
    const document = await parse(
      PATH,
      `function take(first: number, [x, y]: number[], ...rest: number[]): void {}`,
    );
    expect(childNames(document, id(PATH, term('take')))).toEqual(['first', 'rest', 'x', 'y']);
  });

  it('captures an array-pattern rest element', async () => {
    const document = await parse(PATH, `function head([first, ...tail]: number[]): void {}`);
    expect(childNames(document, id(PATH, term('head')))).toEqual(['first', 'tail']);
  });

  it('skips a deeply nested element with no stable public name', async () => {
    const document = await parse(PATH, `function deep([[inner], top]: number[][]): void {}`);
    // The nested `[inner]` element has no single public name; only `top` is captured.
    expect(childNames(document, id(PATH, term('deep')))).toEqual(['top']);
  });

  it('skips a computed or string object-pattern key, never fabricating a [expr]/"s" symbol', async () => {
    const document = await parse(
      PATH,
      `const k = 'x'; function pick({ [k]: dynamic, "lit-key": lit, plain }: Rec): void {}`,
    );
    // A computed (`[k]`) or string (`"lit-key"`) key has no stable public name, so
    // it is skipped — only the plain identifier key is captured (mirrors classifyMember).
    expect(childNames(document, id(PATH, term('pick')))).toEqual(['plain']);
    const names = document.nodes.filter(isSymbolNode).map((node) => node.name);
    expect(names).not.toContain('[k]');
    expect(names.some((name) => name.includes('lit-key'))).toBe(false);
  });

  it('treats destructured props on a component as react:prop, others as ts:parameter', async () => {
    const document = await parse(
      PATH,
      `export const Card = ({ title, onClose = () => {} }: CardProps) => <div>{title}</div>;`,
    );
    const symbols = document.nodes.filter(isSymbolNode);
    const subKindOf = (name: string) => symbols.find((node) => node.name === name)?.subKind;
    expect(subKindOf('title')).toBe('react:prop');
    expect(subKindOf('onClose')).toBe('react:prop');
    // The receiver carries its props for binding.
    expect(
      document.nodes
        .filter(isSymbolNode)
        .some((node) => node.id === id(PATH, term('Card'), param('title'))),
    ).toBe(true);
  });
});
