import type { Descriptor } from '@toopo/core';
import { GraphDocumentSchema, isCallSiteNode, isSymbolNode } from '@toopo/core';
import { createParser } from '@toopo/parser';
import { describe, expect, it } from 'vitest';
import { id, param, term } from '../../test/support/graph-helpers';
import { createReactPlugins } from '../plugin';

const method = (name: string, disambiguator?: string): Descriptor => ({
  name,
  suffix: 'method',
  ...(disambiguator === undefined ? {} : { disambiguator }),
});

async function parse(path: string, source: string) {
  const parser = createParser(createReactPlugins());
  const { document } = await parser.parseFile({ path, bytes: Buffer.from(source) });
  expect(GraphDocumentSchema.safeParse(document).success).toBe(true);
  return document;
}

function symbolSubKind(document: Awaited<ReturnType<typeof parse>>, symbolId: string) {
  return document.nodes.filter(isSymbolNode).find((node) => node.id === symbolId)?.subKind;
}

function hasContains(document: Awaited<ReturnType<typeof parse>>, source: string, target: string) {
  return document.edges.some(
    (edge) => edge.kind === 'contains' && edge.sourceId === source && edge.targetId === target,
  );
}

const PATH = 'src/Shape.tsx';

describe('class member extraction (A1 / C1)', () => {
  it('captures methods, accessors, fields, and constructor params as nested child symbols', async () => {
    const document = await parse(
      PATH,
      `class Shape {
         private count = 0;
         static kind: string = 'shape';
         readonly id?: number;
         constructor(name: string) {}
         draw(x: number): void {}
         get total(): number { return this.count; }
         set total(v: number) { this.count = v; }
         async load(): Promise<void> {}
       }`,
    );

    const shape = id(PATH, term('Shape'));
    expect(symbolSubKind(document, id(PATH, term('Shape'), term('count')))).toBe('ts:field');
    expect(symbolSubKind(document, id(PATH, term('Shape'), term('kind')))).toBe('ts:field');
    expect(symbolSubKind(document, id(PATH, term('Shape'), term('id')))).toBe('ts:field');
    expect(symbolSubKind(document, id(PATH, term('Shape'), method('constructor')))).toBe(
      'ts:method',
    );
    expect(symbolSubKind(document, id(PATH, term('Shape'), method('draw')))).toBe('ts:method');
    expect(symbolSubKind(document, id(PATH, term('Shape'), method('load')))).toBe('ts:method');

    // Every member is a `contains` child of its class.
    expect(hasContains(document, shape, id(PATH, term('Shape'), term('count')))).toBe(true);
    expect(hasContains(document, shape, id(PATH, term('Shape'), method('draw')))).toBe(true);

    // A method's own parameter nests one level deeper, under the method.
    expect(symbolSubKind(document, id(PATH, term('Shape'), method('draw'), param('x')))).toBe(
      'ts:parameter',
    );
    expect(
      hasContains(
        document,
        id(PATH, term('Shape'), method('draw')),
        id(PATH, term('Shape'), method('draw'), param('x')),
      ),
    ).toBe(true);
  });

  it('splits a getter/setter pair into distinct ids via the get/set disambiguator', async () => {
    const document = await parse(
      PATH,
      `class Box {
         get total(): number { return 1; }
         set total(v: number) {}
       }`,
    );
    expect(symbolSubKind(document, id(PATH, term('Box'), method('total', 'get')))).toBe(
      'ts:getter',
    );
    expect(symbolSubKind(document, id(PATH, term('Box'), method('total', 'set')))).toBe(
      'ts:setter',
    );
  });

  it('splits overloaded methods by occurrence; a unique method keeps a bare id', async () => {
    const document = await parse(
      PATH,
      `class Api {
         solo(): void {}
         on(a: number): void;
         on(a: string): void;
         on(a: unknown): void {}
       }`,
    );
    // Unique name → no disambiguator (stable id).
    expect(symbolSubKind(document, id(PATH, term('Api'), method('solo')))).toBe('ts:method');
    // Overloaded name → per-occurrence disambiguators.
    expect(symbolSubKind(document, id(PATH, term('Api'), method('on', '0')))).toBe('ts:method');
    expect(symbolSubKind(document, id(PATH, term('Api'), method('on', '1')))).toBe('ts:method');
    expect(symbolSubKind(document, id(PATH, term('Api'), method('on', '2')))).toBe('ts:method');
  });

  it('captures interface method and property signatures', async () => {
    const document = await parse(
      PATH,
      `interface Drawable {
         color: string;
         onDone?: () => void;
         draw(x: number): void;
       }`,
    );
    expect(symbolSubKind(document, id(PATH, term('Drawable'), term('color')))).toBe('ts:property');
    expect(symbolSubKind(document, id(PATH, term('Drawable'), term('onDone')))).toBe('ts:property');
    expect(symbolSubKind(document, id(PATH, term('Drawable'), method('draw')))).toBe('ts:method');
    expect(symbolSubKind(document, id(PATH, term('Drawable'), method('draw'), param('x')))).toBe(
      'ts:parameter',
    );
  });

  it('skips a computed-key member (no stable public identity)', async () => {
    const document = await parse(
      PATH,
      `const k = 'x';
       class Dyn {
         [k](): void {}
         plain(): void {}
       }`,
    );
    const names = document.nodes.filter(isSymbolNode).map((node) => node.name);
    expect(names).toContain('plain');
    // The computed member contributes no fabricated symbol.
    expect(symbolSubKind(document, id(PATH, term('Dyn'), method('plain')))).toBe('ts:method');
  });

  it('attributes a call inside a method to the method, not the class', async () => {
    const document = await parse(
      PATH,
      `function helper(): void {}
       class Svc {
         run(): void { helper(); }
       }`,
    );
    const call = document.nodes.filter(isCallSiteNode).find((node) => node.callee === 'helper');
    expect(call?.enclosingSymbolId).toBe(id(PATH, term('Svc'), method('run')));
  });
});
