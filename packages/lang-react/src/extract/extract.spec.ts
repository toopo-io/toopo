import { readFile } from 'node:fs/promises';
import {
  canonicalizeGraphDocument,
  formatSymbolId,
  type GraphDocument,
  GraphDocumentSchema,
  isFileNode,
  isSymbolNode,
  parseSymbolId,
} from '@toopo/core';
import { createParser } from '@toopo/parser';
import { describe, expect, it } from 'vitest';
import {
  byJson,
  id,
  local,
  param,
  projectEdges,
  projectSymbols,
  term,
} from '../../test/support/graph-helpers';
import { createReactPlugins } from '../plugin';

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

async function parseFixture(path: string, fixture: string): Promise<GraphDocument> {
  const parser = createParser(createReactPlugins());
  const bytes = await readFile(new URL(`../../test/fixtures/${fixture}`, import.meta.url));
  const { document } = await parser.parseFile({ path, bytes });
  return document;
}

describe('extractReact — Phase C structural graph', () => {
  it('extracts components, hooks, functions and their declared params/props with contains edges', async () => {
    const path = 'src/Widget.tsx';
    const document = await parseFixture(path, 'Widget.tsx');

    expect(GraphDocumentSchema.safeParse(document).success).toBe(true);

    const fileId = id(path);
    expect(byJson(projectSymbols(document))).toEqual(
      byJson([
        { id: id(path, term('Badge')), name: 'Badge', subKind: 'react:component' },
        { id: id(path, term('Badge'), param('count')), name: 'count', subKind: 'react:prop' },
        { id: id(path, term('Badge'), param('label')), name: 'label', subKind: 'react:prop' },
        { id: id(path, term('format')), name: 'format', subKind: 'ts:function' },
        { id: id(path, term('format'), param('value')), name: 'value', subKind: 'ts:parameter' },
        { id: id(path, term('useCounter')), name: 'useCounter', subKind: 'react:hook' },
        {
          id: id(path, term('useCounter'), param('start')),
          name: 'start',
          subKind: 'ts:parameter',
        },
        // the hook's array-destructured locals (ADR-0027)
        {
          id: id(path, term('useCounter'), local('count')),
          name: 'count',
          subKind: 'ts:variable',
        },
        {
          id: id(path, term('useCounter'), local('setCount')),
          name: 'setCount',
          subKind: 'ts:variable',
        },
      ]),
    );

    // Isolate Phase C containment from Phase D's call-site/imports edges.
    const containment = projectEdges(document).filter(
      (edge) => edge.rule === 'react/contains-symbol' || edge.rule.startsWith('react/declares-'),
    );
    expect(byJson(containment)).toEqual(
      byJson([
        contains(fileId, id(path, term('Badge')), 'react/contains-symbol'),
        contains(fileId, id(path, term('format')), 'react/contains-symbol'),
        contains(fileId, id(path, term('useCounter')), 'react/contains-symbol'),
        contains(
          id(path, term('Badge')),
          id(path, term('Badge'), param('count')),
          'react/declares-prop',
        ),
        contains(
          id(path, term('Badge')),
          id(path, term('Badge'), param('label')),
          'react/declares-prop',
        ),
        contains(
          id(path, term('format')),
          id(path, term('format'), param('value')),
          'react/declares-parameter',
        ),
        contains(
          id(path, term('useCounter')),
          id(path, term('useCounter'), param('start')),
          'react/declares-parameter',
        ),
        contains(
          id(path, term('useCounter')),
          id(path, term('useCounter'), local('count')),
          'react/declares-local',
        ),
        contains(
          id(path, term('useCounter')),
          id(path, term('useCounter'), local('setCount')),
          'react/declares-local',
        ),
      ]),
    );
  });

  it('classifies edge-case declarations and declared inputs faithfully', async () => {
    const path = 'src/Variants.tsx';
    const document = await parseFixture(path, 'Variants.tsx');

    expect(byJson(projectSymbols(document))).toEqual(
      byJson([
        // arrow with an implicit JSX body → component
        { id: id(path, term('Pill')), name: 'Pill', subKind: 'react:component' },
        // use-prefixed → hook; its destructured field is a ts:parameter, NOT a prop
        { id: id(path, term('useToggle')), name: 'useToggle', subKind: 'react:hook' },
        {
          id: id(path, term('useToggle'), param('initial')),
          name: 'initial',
          subKind: 'ts:parameter',
        },
        // optional parameter is still a declared ts:parameter
        { id: id(path, term('withOptional')), name: 'withOptional', subKind: 'ts:function' },
        {
          id: id(path, term('withOptional'), param('a')),
          name: 'a',
          subKind: 'ts:parameter',
        },
        // a top-level rest param is captured by its binding name (C6)
        { id: id(path, term('withRest')), name: 'withRest', subKind: 'ts:function' },
        { id: id(path, term('withRest'), param('args')), name: 'args', subKind: 'ts:parameter' },
        // an array-pattern element binding is captured (C6)
        { id: id(path, term('withArray')), name: 'withArray', subKind: 'ts:function' },
        { id: id(path, term('withArray'), param('first')), name: 'first', subKind: 'ts:parameter' },
        // spread props: the shorthand `title` and the rest collector `...rest` are both props
        { id: id(path, term('Card')), name: 'Card', subKind: 'react:component' },
        { id: id(path, term('Card'), param('title')), name: 'title', subKind: 'react:prop' },
        { id: id(path, term('Card'), param('rest')), name: 'rest', subKind: 'react:prop' },
      ]),
    );
  });

  it('mints child ids that round-trip through the core descriptor codec', async () => {
    const document = await parseFixture('src/Widget.tsx', 'Widget.tsx');
    for (const node of document.nodes.filter(isSymbolNode)) {
      expect(formatSymbolId(parseSymbolId(node.id))).toBe(node.id);
    }
  });

  it('handles a component with no declared props (only the symbol + one contains edge)', async () => {
    const path = 'src/NoProps.tsx';
    const document = await parseFixture(path, 'NoProps.tsx');

    expect(projectSymbols(document)).toEqual([
      { id: id(path, term('Empty')), name: 'Empty', subKind: 'react:component' },
    ]);
    expect(projectEdges(document)).toEqual([
      contains(id(path), id(path, term('Empty')), 'react/contains-symbol'),
      {
        kind: 'exports',
        sourceId: id(path),
        targetId: id(path, term('Empty')),
        rule: 'react/exports-local',
        resolution: 'deterministic',
      },
    ]);
  });

  it('skips an anonymous default export (no name → no fabricated symbol)', async () => {
    const document = await parseFixture('src/Anonymous.tsx', 'Anonymous.tsx');
    expect(document.nodes.filter(isSymbolNode)).toEqual([]);
    expect(document.nodes.filter(isFileNode)).toHaveLength(1);
    expect(document.edges).toEqual([]);
  });

  it('degrades a syntactically broken .tsx to parse-error with no symbols', async () => {
    const parser = createParser(createReactPlugins());
    const { document } = await parser.parseFile({
      path: 'src/Broken.tsx',
      bytes: encode('export function Broken({ a, '),
    });
    const files = document.nodes.filter(isFileNode);
    expect(files[0]?.analysis.status).toBe('parse-error');
    expect(document.nodes.filter(isSymbolNode)).toEqual([]);
  });

  it('is deterministic — the same bytes yield a byte-identical document', async () => {
    const parser = createParser(createReactPlugins());
    const bytes = await readFile(new URL('../../test/fixtures/Widget.tsx', import.meta.url));
    const first = await parser.parseFile({ path: 'src/Widget.tsx', bytes });
    const second = await parser.parseFile({ path: 'src/Widget.tsx', bytes });
    expect(JSON.stringify(first.document)).toBe(JSON.stringify(second.document));
    expect(first.document).toEqual(canonicalizeGraphDocument(first.document));
  });
});

function contains(sourceId: string, targetId: string, rule: string) {
  return { kind: 'contains', sourceId, targetId, rule, resolution: 'deterministic' };
}
