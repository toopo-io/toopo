import { readFile } from 'node:fs/promises';
import {
  composeCallSiteId,
  type GraphDocument,
  GraphDocumentSchema,
  isCallSiteNode,
} from '@toopo/core';
import { createParser } from '@toopo/parser';
import { describe, expect, it } from 'vitest';
import { byJson, id, param, term } from '../../test/support/graph-helpers';
import { createReactPlugin } from '../plugin';

const PATH = 'src/Render.tsx';

async function parseRender(): Promise<GraphDocument> {
  const parser = createParser([createReactPlugin()]);
  const bytes = await readFile(new URL('../../test/fixtures/Render.tsx', import.meta.url));
  const { document } = await parser.parseFile({ path: PATH, bytes });
  return document;
}

const panelId = id(PATH, term('Panel'));
const badgeRender = (ordinal: number): string =>
  composeCallSiteId({ enclosingSymbolId: panelId, calleeReference: 'Badge', ordinal });

const named = (ordinal: number, name: string, value: string) => ({
  ordinal,
  name,
  passKind: 'named',
  value,
  resolution: 'deterministic',
});

describe('extractReact — Phase F JSX renders', () => {
  it('emits a render call-site (react:element) per component element, with props as payload', async () => {
    const document = await parseRender();
    expect(GraphDocumentSchema.safeParse(document).success).toBe(true);

    const renders = document.nodes
      .filter(isCallSiteNode)
      .filter((node) => node.subKind === 'react:element')
      .map((node) => ({ callee: node.callee, ordinal: node.ordinal, payload: node.payload }));

    expect(byJson(renders)).toEqual(
      byJson([
        { callee: 'Badge', ordinal: 0, payload: [named(0, 'a', '1'), named(1, 'b', '"x"')] },
        {
          callee: 'Badge',
          ordinal: 1,
          payload: [
            {
              ordinal: 0,
              passKind: 'spread',
              value: 'rest',
              resolution: 'inferred',
              confidence: 'low',
            },
          ],
        },
        { callee: 'Badge', ordinal: 2, payload: [named(0, 'a', '2'), named(1, 'b', '"y"')] },
        { callee: 'Badge', ordinal: 3, payload: [named(0, 'a', '3'), named(1, 'b', '"z"')] },
        { callee: 'Button', ordinal: 0, payload: [] },
        { callee: 'Icon', ordinal: 0, payload: [] },
      ]),
    );
  });

  it('resolves render edges: in-file and package deterministic; relative gets none (resolver-correlated)', async () => {
    const document = await parseRender();
    const renders = document.edges
      .filter((edge) => edge.subKind === 'react:renders')
      .map((edge) => ({
        sourceId: edge.sourceId,
        targetId: edge.targetId,
        rule: edge.provenance.rule,
      }));

    expect(byJson(renders)).toEqual(
      byJson([
        {
          sourceId: badgeRender(0),
          targetId: id(PATH, term('Badge')),
          rule: 'react/renders-local',
        },
        {
          sourceId: badgeRender(1),
          targetId: id(PATH, term('Badge')),
          rule: 'react/renders-local',
        },
        {
          sourceId: badgeRender(2),
          targetId: id(PATH, term('Badge')),
          rule: 'react/renders-local',
        },
        {
          sourceId: badgeRender(3),
          targetId: id(PATH, term('Badge')),
          rule: 'react/renders-local',
        },
        {
          sourceId: composeCallSiteId({
            enclosingSymbolId: panelId,
            calleeReference: 'Icon',
            ordinal: 0,
          }),
          targetId: 'npm lib Icon.',
          rule: 'react/renders-external',
        },
      ]),
    );
    // Button is relative-imported: no fabricated render edge.
    const buttonRender = composeCallSiteId({
      enclosingSymbolId: panelId,
      calleeReference: 'Button',
      ordinal: 0,
    });
    expect(document.edges.some((edge) => edge.sourceId === buttonRender)).toBe(false);
  });

  it('binds named props to an in-file receiver prop; never a spread, external, or relative receiver', async () => {
    const document = await parseRender();
    const bindings = document.edges
      .filter((edge) => edge.subKind === 'react:propBinding')
      .map((edge) => ({
        sourceId: edge.sourceId,
        targetId: edge.targetId,
        rule: edge.provenance.rule,
      }));

    const propA = id(PATH, term('Badge'), param('a'));
    const propB = id(PATH, term('Badge'), param('b'));
    // Only the three named Badge renders bind; the spread render (#1) binds nothing.
    expect(byJson(bindings)).toEqual(
      byJson([
        { sourceId: badgeRender(0), targetId: propA, rule: 'react/binds-prop' },
        { sourceId: badgeRender(0), targetId: propB, rule: 'react/binds-prop' },
        { sourceId: badgeRender(2), targetId: propA, rule: 'react/binds-prop' },
        { sourceId: badgeRender(2), targetId: propB, rule: 'react/binds-prop' },
        { sourceId: badgeRender(3), targetId: propA, rule: 'react/binds-prop' },
        { sourceId: badgeRender(3), targetId: propB, rule: 'react/binds-prop' },
      ]),
    );
  });

  it('never produces a render call-site for an intrinsic host element', async () => {
    const document = await parseRender();
    const intrinsic = document.nodes
      .filter(isCallSiteNode)
      .filter((node) => node.callee === 'div' || node.callee === 'span');
    expect(intrinsic).toEqual([]);
  });

  it('is deterministic — the same bytes yield a byte-identical document', async () => {
    const parser = createParser([createReactPlugin()]);
    const bytes = await readFile(new URL('../../test/fixtures/Render.tsx', import.meta.url));
    const first = await parser.parseFile({ path: PATH, bytes });
    const second = await parser.parseFile({ path: PATH, bytes });
    expect(JSON.stringify(first.document)).toBe(JSON.stringify(second.document));
  });
});
