import { readFile } from 'node:fs/promises';
import {
  canonicalizeGraphDocument,
  composeCallSiteId,
  type GraphDocument,
  GraphDocumentSchema,
  isCallSiteNode,
} from '@toopo/core';
import { createParser } from '@toopo/parser';
import { describe, expect, it } from 'vitest';
import { byJson, id, param, projectEdges, term } from '../../test/support/graph-helpers';
import { createReactPlugins } from '../plugin';

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

async function parseFixture(path: string, fixture: string) {
  const parser = createParser(createReactPlugins());
  const bytes = await readFile(new URL(`../../test/fixtures/${fixture}`, import.meta.url));
  return parser.parseFile({ path, bytes });
}

function importsEdge(fileId: string, targetId: string) {
  return {
    kind: 'imports',
    sourceId: fileId,
    targetId,
    rule: 'react/import-external',
    resolution: 'deterministic',
  };
}

function projectCallSites(document: GraphDocument) {
  return document.nodes
    .filter(isCallSiteNode)
    .filter((node) => node.subKind !== 'react:element') // function calls, not JSX renders
    .map((node) => ({
      id: node.id,
      enclosingSymbolId: node.enclosingSymbolId,
      callee: node.callee,
      ordinal: node.ordinal,
      payload: node.payload,
    }));
}

describe('extractReact — Phase D call-sites and imports', () => {
  const path = 'src/Calls.tsx';
  const npmTerm = (name: string): string => `npm lib ${name}.`;

  it('emits a call-site per identifier call, attributed to the nearest enclosing symbol, with its arguments as payload', async () => {
    const { document } = await parseFixture(path, 'Calls.tsx');
    expect(GraphDocumentSchema.safeParse(document).success).toBe(true);

    const panelId = id(path, term('Panel'));
    const callSite = (callee: string) =>
      composeCallSiteId({ enclosingSymbolId: panelId, calleeReference: callee, ordinal: 0 });
    const positional = (value: string) => [
      { ordinal: 0, passKind: 'positional', value, resolution: 'deterministic' },
    ];
    const payloads: Record<string, unknown[]> = {
      useState: positional('false'),
      helper: positional('1'),
      calc: positional('2'),
      D: [],
      setOpen: positional('open'),
    };

    expect(byJson(projectCallSites(document))).toEqual(
      byJson(
        ['useState', 'helper', 'calc', 'D', 'setOpen'].map((callee) => ({
          id: callSite(callee),
          enclosingSymbolId: panelId,
          callee,
          ordinal: 0,
          payload: payloads[callee],
        })),
      ),
    );
  });

  it('binds positional arguments to an in-file receiver param; never for external or local-var callees', async () => {
    const { document } = await parseFixture(path, 'Calls.tsx');
    const panelId = id(path, term('Panel'));
    const helperCallSite = composeCallSiteId({
      enclosingSymbolId: panelId,
      calleeReference: 'helper',
      ordinal: 0,
    });

    const references = document.edges.filter((edge) => edge.kind === 'references');
    expect(references).toHaveLength(1);
    expect(references[0]).toMatchObject({
      kind: 'references',
      sourceId: helperCallSite,
      targetId: id(path, term('helper'), param('x')),
      subKind: 'ts:argBinding',
      resolution: 'deterministic',
      provenance: { pass: 'parse', rule: 'react/binds-arg' },
    });
  });

  it('emits deterministic external imports edges and carries relative/type-only imports as unresolved', async () => {
    const { document, unresolved } = await parseFixture(path, 'Calls.tsx');
    const fileId = id(path);

    const importEdges = projectEdges(document).filter((edge) => edge.kind === 'imports');
    expect(byJson(importEdges)).toEqual(
      byJson([
        importsEdge(fileId, 'npm react useState.'),
        importsEdge(fileId, npmTerm('default')),
        importsEdge(fileId, npmTerm('compute')),
      ]),
    );

    expect(byJson([...unresolved])).toEqual(
      byJson([
        {
          importerFileId: fileId,
          importerPath: path,
          specifier: './Button',
          imported: [{ name: 'Button', localName: 'Button', kind: 'named', typeOnly: false }],
          typeOnly: false,
          location: expect.any(Object),
        },
        {
          importerFileId: fileId,
          importerPath: path,
          specifier: './types',
          imported: [{ name: 'Props', localName: 'Props', kind: 'named', typeOnly: true }],
          typeOnly: true,
          location: expect.any(Object),
        },
      ]),
    );
  });

  it('emits a calls edge ONLY for lexically resolvable callees (external binding or local symbol)', async () => {
    const { document } = await parseFixture(path, 'Calls.tsx');
    const panelId = id(path, term('Panel'));
    const callSite = (callee: string) =>
      composeCallSiteId({ enclosingSymbolId: panelId, calleeReference: callee, ordinal: 0 });

    const callsEdges = projectEdges(document).filter((edge) => edge.kind === 'calls');
    expect(byJson(callsEdges)).toEqual(
      byJson([
        {
          kind: 'calls',
          sourceId: callSite('useState'),
          targetId: 'npm react useState.',
          rule: 'react/calls-external',
          resolution: 'deterministic',
        },
        {
          kind: 'calls',
          sourceId: callSite('D'),
          targetId: npmTerm('default'),
          rule: 'react/calls-external',
          resolution: 'deterministic',
        },
        {
          kind: 'calls',
          sourceId: callSite('calc'),
          targetId: npmTerm('compute'),
          rule: 'react/calls-external',
          resolution: 'deterministic',
        },
        {
          kind: 'calls',
          sourceId: callSite('helper'),
          targetId: id(path, term('helper')),
          rule: 'react/calls-local',
          resolution: 'deterministic',
        },
      ]),
    );
    // setOpen is a local variable (from destructuring), so it gets a call-site
    // but NO fabricated calls edge.
    expect(callsEdges.some((edge) => edge.sourceId === callSite('setOpen'))).toBe(false);
  });

  it('defers external namespace and side-effect imports; carries a relative side-effect as unresolved', async () => {
    const { document, unresolved } = await parseFixture('src/Imports.tsx', 'Imports.tsx');
    // No external imports edge for `import * as ns` or `import 'polyfill'`.
    expect(projectEdges(document).filter((edge) => edge.kind === 'imports')).toEqual([]);
    // The relative side-effect import is recorded for the resolver (no bindings).
    expect(
      unresolved.map((entry) => ({ specifier: entry.specifier, imported: entry.imported })),
    ).toEqual([{ specifier: './styles.css', imported: [] }]);
  });

  it('assigns source-order ordinals to repeated calls of the same callee', async () => {
    const parser = createParser(createReactPlugins());
    const { document } = await parser.parseFile({
      path: 'src/Repeat.tsx',
      bytes: encode('export function run() {\n  step();\n  step();\n}\n'),
    });
    const runId = id('src/Repeat.tsx', term('run'));
    const callees = document.nodes.filter(isCallSiteNode).map((node) => node.ordinal);
    expect(callees.sort()).toEqual([0, 1]);
    expect(
      document.nodes.filter(isCallSiteNode).every((node) => node.enclosingSymbolId === runId),
    ).toBe(true);
  });

  it('resolves scoped packages and defers path-alias imports', async () => {
    const parser = createParser(createReactPlugins());
    const source =
      "import { thing } from '@scope/pkg';\nimport { local } from '@/local';\nexport function use() {\n  thing();\n}\n";
    const { document, unresolved } = await parser.parseFile({
      path: 'src/Scoped.tsx',
      bytes: encode(source),
    });

    const importTargets = projectEdges(document)
      .filter((edge) => edge.kind === 'imports')
      .map((edge) => edge.targetId);
    expect(importTargets).toEqual(['npm @scope/pkg thing.']);
    // a `@/` path alias is not an npm package — it needs the resolver.
    expect(unresolved.map((entry) => entry.specifier)).toEqual(['@/local']);
  });

  it('ignores a module-level call not contained by any extracted symbol', async () => {
    const parser = createParser(createReactPlugins());
    const { document } = await parser.parseFile({
      path: 'src/Top.tsx',
      bytes: encode('doThing();\n'),
    });
    expect(document.nodes.filter(isCallSiteNode)).toEqual([]);
  });

  it('binds a positional arg only to a unique param slot — never a spread or a destructured slot', async () => {
    const argsPath = 'src/Args.tsx';
    const { document } = await parseFixture(argsPath, 'Args.tsx');

    const firstCall = composeCallSiteId({
      enclosingSymbolId: id(argsPath, term('caller')),
      calleeReference: 'take',
      ordinal: 0,
    });
    const references = document.edges
      .filter((edge) => edge.kind === 'references')
      .map((edge) => ({ sourceId: edge.sourceId, targetId: edge.targetId, subKind: edge.subKind }));
    // arg0 → unique slot `first`; arg1 (the destructured object slot) and the
    // spread call produce NO binding.
    expect(references).toEqual([
      {
        sourceId: firstCall,
        targetId: id(argsPath, term('take'), param('first')),
        subKind: 'ts:argBinding',
      },
    ]);

    const spreadPayload = document.nodes
      .filter(isCallSiteNode)
      .find((node) => node.payload.some((entry) => entry.passKind === 'spread'))?.payload;
    expect(spreadPayload).toEqual([
      { ordinal: 0, passKind: 'spread', value: 'stuff', resolution: 'inferred', confidence: 'low' },
    ]);
  });

  it('is deterministic — the same bytes yield a byte-identical document', async () => {
    const parser = createParser(createReactPlugins());
    const bytes = await readFile(new URL('../../test/fixtures/Calls.tsx', import.meta.url));
    const first = await parser.parseFile({ path, bytes });
    const second = await parser.parseFile({ path, bytes });
    expect(JSON.stringify(first.document)).toBe(JSON.stringify(second.document));
    expect(first.document).toEqual(canonicalizeGraphDocument(first.document));
  });
});
