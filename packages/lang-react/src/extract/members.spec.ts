import { readFile } from 'node:fs/promises';
import { composeCallSiteId, GraphDocumentSchema, isCallSiteNode } from '@toopo/core';
import { createParser } from '@toopo/parser';
import { describe, expect, it } from 'vitest';
import { id, term } from '../../test/support/graph-helpers';
import { createReactPlugin } from '../plugin';

const PATH = 'src/Members.tsx';

describe('extractReact — Phase G member callees and elements', () => {
  it('captures member calls and member JSX with their full member-path callees', async () => {
    const parser = createParser([createReactPlugin()]);
    const bytes = await readFile(new URL('../../test/fixtures/Members.tsx', import.meta.url));
    const { document } = await parser.parseFile({ path: PATH, bytes });
    expect(GraphDocumentSchema.safeParse(document).success).toBe(true);

    const panelId = id(PATH, term('Panel'));
    const callSites = document.nodes.filter(isCallSiteNode).map((node) => ({
      callee: node.callee,
      isRender: node.subKind === 'react:element',
      id: node.id,
      payload: node.payload,
    }));

    // A dotted tag is always a component render (even `motion.div`); `data.includes`
    // is a member call. All keep their FULL member path so the resolver can bind them.
    expect(callSites.find((site) => site.callee === 'Form.Item')).toMatchObject({
      isRender: true,
      payload: [{ name: 'label', passKind: 'named', value: '"x"', resolution: 'deterministic' }],
      id: composeCallSiteId({
        enclosingSymbolId: panelId,
        calleeReference: 'Form.Item',
        ordinal: 0,
      }),
    });
    expect(callSites.find((site) => site.callee === 'motion.div')?.isRender).toBe(true);
    expect(callSites.find((site) => site.callee === 'data.includes')).toMatchObject({
      isRender: false,
      payload: [{ ordinal: 0, passKind: 'positional', value: '1', resolution: 'deterministic' }],
    });
  });

  it('fabricates no calls/renders/references edge for a member target (resolver-deferred)', async () => {
    const parser = createParser([createReactPlugin()]);
    const bytes = await readFile(new URL('../../test/fixtures/Members.tsx', import.meta.url));
    const { document } = await parser.parseFile({ path: PATH, bytes });

    // Every receiver here is a member expression — none gets a deterministic edge,
    // even though `Form`/`motion` are imported (the member path is not the binding).
    const targetEdges = document.edges.filter(
      (edge) => edge.kind === 'calls' || edge.kind === 'references',
    );
    expect(targetEdges).toEqual([]);
  });
});
