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
