import { GraphDocumentSchema, isSymbolNode, type Node } from '@toopo/core';
import { createParser } from '@toopo/parser';
import { describe, expect, it } from 'vitest';
import { createReactPlugins } from '../plugin';

async function parse(source: string) {
  const parser = createParser(createReactPlugins());
  const { document } = await parser.parseFile({
    path: 'src/Detail.tsx',
    bytes: Buffer.from(source),
  });
  expect(GraphDocumentSchema.safeParse(document).success).toBe(true);
  return document;
}

function byName(document: Awaited<ReturnType<typeof parse>>, name: string): Node | undefined {
  return document.nodes.filter(isSymbolNode).find((node) => node.name === name);
}

describe('properties enrichment (A2)', () => {
  it('captures return type, async, and JSDoc on a function', async () => {
    const document = await parse(
      `/** Adds. */
       export async function add(a: number): Promise<number> { return a; }`,
    );
    expect(byName(document, 'add')?.properties).toMatchObject({
      async: true,
      returnType: 'Promise<number>',
      jsdoc: '/** Adds. */',
    });
  });

  it('captures param type, optionality, default, and rest', async () => {
    const document = await parse(
      `function f(a: number, b = 2, c?: string, ...rest: number[]): void {}`,
    );
    expect(byName(document, 'a')?.properties).toMatchObject({ type: 'number' });
    expect(byName(document, 'b')?.properties).toMatchObject({ default: '2' });
    expect(byName(document, 'c')?.properties).toMatchObject({ type: 'string', optional: true });
    expect(byName(document, 'rest')?.properties).toMatchObject({ rest: true, type: 'number[]' });
  });

  it('captures a destructured prop default by the public key', async () => {
    const document = await parse(`export const Card = ({ title = 'x' }: P) => <div>{title}</div>;`);
    expect(byName(document, 'title')?.properties).toMatchObject({ default: "'x'" });
  });

  it('captures member modifiers, return types, accessors, and field detail', async () => {
    const document = await parse(
      `abstract class Widget {
         private readonly seed: number = 1;
         static label = 'w';
         abstract draw(): void;
         async load(): Promise<void> {}
         get total(): number { return 1; }
       }`,
    );
    expect(byName(document, 'seed')?.properties).toMatchObject({
      visibility: 'private',
      readonly: true,
      type: 'number',
      default: '1',
    });
    expect(byName(document, 'label')?.properties).toMatchObject({ static: true, default: "'w'" });
    expect(byName(document, 'draw')?.properties).toMatchObject({
      abstract: true,
      returnType: 'void',
    });
    expect(byName(document, 'load')?.properties).toMatchObject({
      async: true,
      returnType: 'Promise<void>',
    });
    expect(byName(document, 'total')?.properties).toMatchObject({ returnType: 'number' });
  });

  it('classifies a class extending React.Component as a component, keeping its members', async () => {
    const document = await parse(
      `import React from 'react';
       export class Panel extends React.Component {
         render(): JSX.Element { return <div/>; }
       }`,
    );
    expect(byName(document, 'Panel')?.subKind).toBe('react:component');
    // The class component still declares its members.
    expect(byName(document, 'render')?.subKind).toBe('ts:method');
  });

  it('classifies a bare `extends Component` class as a component', async () => {
    const document = await parse(
      `import { Component } from 'react';
       export class Box extends Component {
         render() { return null; }
       }`,
    );
    expect(byName(document, 'Box')?.subKind).toBe('react:component');
  });

  it('keeps a non-React class as ts:class', async () => {
    const document = await parse(`export class Service extends Base {}`);
    expect(byName(document, 'Service')?.subKind).toBe('ts:class');
  });

  it('captures a value variable type annotation', async () => {
    const document = await parse(`export const limit: number = 5;`);
    expect(byName(document, 'limit')?.properties).toMatchObject({ type: 'number' });
  });

  it('leaves an undecorated symbol with an empty properties bag', async () => {
    const document = await parse(`function plain(a) { return a; }`);
    expect(byName(document, 'plain')?.properties).toEqual({});
  });
});
