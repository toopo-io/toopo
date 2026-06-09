import { readFile } from 'node:fs/promises';
import { isFileNode, isSymbolNode } from '@toopo/core';
import { createParser } from '@toopo/parser';
import { describe, expect, it } from 'vitest';
import { createReactPlugins } from './plugin';

const TSX_FIXTURE_URL = new URL('../test/fixtures/Counter.tsx', import.meta.url);
const TS_FIXTURE_URL = new URL('../test/fixtures/generic.ts', import.meta.url);

describe('createReactPlugins', () => {
  it('returns a .tsx (JSX) variant and a .ts (no-JSX) variant', () => {
    const [tsx, ts] = createReactPlugins();
    expect(tsx.matches({ path: 'src/Counter.tsx' })).toBe(true);
    expect(tsx.matches({ path: 'src/util.ts' })).toBe(false);
    expect(ts.matches({ path: 'src/util.ts' })).toBe(true);
    expect(ts.matches({ path: 'src/Counter.tsx' })).toBe(false);
    expect(tsx.matches({ path: 'src/styles.css' })).toBe(false);
    expect(ts.matches({ path: 'src/styles.css' })).toBe(false);
    // Distinct grammars are bound, keyed apart in the parser's grammar cache.
    expect(tsx.grammar.id).not.toBe(ts.grammar.id);
  });

  it('parses a real .tsx through the parser + plugin into an analyzed file node', async () => {
    const parser = createParser(createReactPlugins());
    const bytes = await readFile(TSX_FIXTURE_URL);

    const { document, unresolved } = await parser.parseFile({ path: 'src/Counter.tsx', bytes });

    const file = document.nodes.find(isFileNode);
    expect(file?.analysis).toEqual({ status: 'analyzed' });
    expect(file?.path).toBe('src/Counter.tsx');
    expect(file?.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(unresolved.map((entry) => entry.specifier)).toEqual(['./Button']);
  });

  it('parses a real .ts file — incl. a `<T>x` type assertion — as analyzed', async () => {
    // The `tsx` grammar misparses `<Options>raw` as JSX and errors; the `.ts`
    // variant uses the `typescript` grammar, so the file parses cleanly.
    const parser = createParser(createReactPlugins());
    const bytes = await readFile(TS_FIXTURE_URL);

    const { document, unresolved } = await parser.parseFile({ path: 'src/generic.ts', bytes });

    const file = document.nodes.find(isFileNode);
    expect(file?.analysis).toEqual({ status: 'analyzed' });
    expect(unresolved.map((entry) => entry.specifier)).toEqual(['./helper']);
  });

  it('never classifies a `.ts` symbol as a component (no JSX in .ts)', async () => {
    const parser = createParser(createReactPlugins());
    const bytes = await readFile(TS_FIXTURE_URL);

    const { document } = await parser.parseFile({ path: 'src/generic.ts', bytes });

    const symbols = document.nodes.filter(isSymbolNode);
    // `Widget` is Capitalized but lives in a `.ts` file → `ts:function`.
    const widget = symbols.find((node) => node.name === 'Widget');
    expect(widget?.subKind).toBe('ts:function');
    expect(symbols.some((node) => node.subKind === 'react:component')).toBe(false);
  });
});
