import type { Descriptor } from '@toopo/core';
import { GraphDocumentSchema, isCallSiteNode, isSymbolNode } from '@toopo/core';
import { createParser } from '@toopo/parser';
import { describe, expect, it } from 'vitest';
import { id, local, param, term } from '../../test/support/graph-helpers';
import { createReactPlugins } from '../plugin';

async function parse(path: string, source: string) {
  const parser = createParser(createReactPlugins());
  const { document } = await parser.parseFile({ path, bytes: Buffer.from(source) });
  expect(GraphDocumentSchema.safeParse(document).success).toBe(true);
  return document;
}

function symbol(document: Awaited<ReturnType<typeof parse>>, symbolId: string) {
  return document.nodes.filter(isSymbolNode).find((node) => node.id === symbolId);
}

const PATH = 'src/Locals.tsx';

describe('local & nested-scope extraction (A3 / ADR-0027)', () => {
  it('captures a local variable and a nested function under their enclosing scope', async () => {
    const document = await parse(
      PATH,
      `export function outer(a: number): number {
         const total = a + 1;
         function inner(z: number): number { return z; }
         return inner(total);
       }`,
    );
    expect(symbol(document, id(PATH, term('outer'), local('total')))?.subKind).toBe('ts:variable');
    expect(symbol(document, id(PATH, term('outer'), local('inner')))?.subKind).toBe('ts:function');
    // A nested function's own parameter nests beneath it.
    expect(symbol(document, id(PATH, term('outer'), local('inner'), param('z')))?.subKind).toBe(
      'ts:parameter',
    );
  });

  it('captures array- and object-destructured locals by public name', async () => {
    const document = await parse(
      PATH,
      `export function useThing() {
         const [value, setValue] = useState(0);
         const { width, height: h } = useSize();
         return { value, setValue, width, h };
       }`,
    );
    expect(symbol(document, id(PATH, term('useThing'), local('value')))?.subKind).toBe(
      'ts:variable',
    );
    expect(symbol(document, id(PATH, term('useThing'), local('setValue')))).toBeDefined();
    expect(symbol(document, id(PATH, term('useThing'), local('width')))).toBeDefined();
    // The renamed binding is addressed by its public key `height`, not the alias `h`.
    expect(symbol(document, id(PATH, term('useThing'), local('height')))).toBeDefined();
    expect(document.nodes.filter(isSymbolNode).some((node) => node.name === 'h')).toBe(false);
  });

  it('disambiguates same-named locals in sibling scopes by source order', async () => {
    const document = await parse(
      PATH,
      `export function pick(flag: boolean): number {
         if (flag) { const x = 1; return x; }
         const x = 2;
         return x;
       }`,
    );
    expect(symbol(document, id(PATH, term('pick'), local('x', '0')))).toBeDefined();
    expect(symbol(document, id(PATH, term('pick'), local('x', '1')))).toBeDefined();
    // A non-shadowed local carries no disambiguator.
    expect(symbol(document, id(PATH, term('pick'), local('x')))).toBeUndefined();
  });

  it('classifies a nested arrow component/hook by name and JSX', async () => {
    const document = await parse(
      PATH,
      `export function App() {
         const Row = () => <div/>;
         const useLocalThing = () => 1;
         return <Row/>;
       }`,
    );
    expect(symbol(document, id(PATH, term('App'), local('Row')))?.subKind).toBe('react:component');
    expect(symbol(document, id(PATH, term('App'), local('useLocalThing')))?.subKind).toBe(
      'react:hook',
    );
  });

  it('attributes a call inside a nested function to that function', async () => {
    const document = await parse(
      PATH,
      `function sink(): void {}
       export function outer(): void {
         function inner(): void { sink(); }
         inner();
       }`,
    );
    const call = document.nodes.filter(isCallSiteNode).find((node) => node.callee === 'sink');
    expect(call?.enclosingSymbolId).toBe(id(PATH, term('outer'), local('inner')));
  });

  it('captures module-level destructured bindings as top-level term symbols', async () => {
    const document = await parse(PATH, `export const { alpha, beta } = config;`);
    expect(symbol(document, id(PATH, term('alpha')))?.subKind).toBe('ts:variable');
    expect(symbol(document, id(PATH, term('beta')))?.subKind).toBe('ts:variable');
  });

  it('does not anchor locals inside an anonymous callback (no stable identity)', async () => {
    const document = await parse(
      PATH,
      `export function run(items: number[]): void {
         items.forEach((entry) => { const doubled = entry * 2; });
       }`,
    );
    // The anonymous arrow's local has no stable named path → not captured.
    expect(document.nodes.filter(isSymbolNode).some((node) => node.name === 'doubled')).toBe(false);
  });

  it('captures local detail in the properties bag', async () => {
    const document = await parse(
      PATH,
      `export function outer(): void { const ratio: number = 0.5; }`,
    );
    const ratio: Descriptor = local('ratio');
    expect(symbol(document, id(PATH, term('outer'), ratio))?.properties).toMatchObject({
      type: 'number',
    });
  });
});
