import { readFile } from 'node:fs/promises';
import { composeCallSiteId, type GraphDocument } from '@toopo/core';
import { createParser, type ParseResult } from '@toopo/parser';
import { resolveProject } from '@toopo/resolver';
import { describe, expect, it } from 'vitest';
import { id, param, term } from '../../test/support/graph-helpers';
import { createReactPlugins } from '../plugin';
import { createReactResolver } from './resolver';

const FILES: readonly { path: string; fixture: string }[] = [
  { path: 'src/Consumer.tsx', fixture: 'Consumer.tsx' },
  { path: 'src/ui/index.tsx', fixture: 'ui/index.tsx' },
  { path: 'src/ui/Button.tsx', fixture: 'ui/Button.tsx' },
  { path: 'src/StarConsumer.tsx', fixture: 'StarConsumer.tsx' },
  { path: 'src/all/index.tsx', fixture: 'all/index.tsx' },
  { path: 'src/all/Widget.tsx', fixture: 'all/Widget.tsx' },
  { path: 'src/MemberConsumer.tsx', fixture: 'MemberConsumer.tsx' },
  { path: 'src/NamespaceConsumer.tsx', fixture: 'NamespaceConsumer.tsx' },
  { path: 'src/Form.tsx', fixture: 'Form.tsx' },
  { path: 'src/MultiConsumer.tsx', fixture: 'MultiConsumer.tsx' },
  { path: 'src/multi/index.tsx', fixture: 'multi/index.tsx' },
  { path: 'src/multi/first.tsx', fixture: 'multi/first.tsx' },
  { path: 'src/multi/second.tsx', fixture: 'multi/second.tsx' },
];

async function resolveFixtures(): Promise<{
  document: GraphDocument;
  edges: ResolveEdge[];
  diagnostics: readonly { code: string; specifier: string }[];
}> {
  const parser = createParser(createReactPlugins());
  const fragments: ParseResult[] = [];
  for (const file of FILES) {
    const bytes = await readFile(
      new URL(`../../test/fixtures/resolve/${file.fixture}`, import.meta.url),
    );
    fragments.push(await parser.parseFile({ path: file.path, bytes }));
  }
  const { document, diagnostics } = resolveProject(fragments, [createReactResolver()]);
  return { document, edges: resolveEdges(document), diagnostics };
}

interface ResolveEdge {
  kind: string;
  sourceId: string;
  targetId: string;
  rule: string;
  subKind: string | undefined;
  resolution: string;
  confidence: string | undefined;
}

function resolveEdges(document: GraphDocument): ResolveEdge[] {
  return document.edges
    .filter((edge) => edge.provenance.pass === 'resolve')
    .map((edge) => ({
      kind: edge.kind,
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      rule: edge.provenance.rule,
      subKind: edge.subKind,
      resolution: edge.resolution,
      confidence: edge.resolution === 'inferred' ? edge.confidence : undefined,
    }));
}

const callSite = (file: string, symbol: string, callee: string) =>
  composeCallSiteId({
    enclosingSymbolId: id(file, term(symbol)),
    calleeReference: callee,
    ordinal: 0,
  });

describe('createReactResolver — Slice 3 barrels, stars, and member roots', () => {
  it('resolves a named barrel chain deterministically (Consumer → ui/index → ui/Button)', async () => {
    const { edges } = await resolveFixtures();
    const buttonId = id('src/ui/Button.tsx', term('Button'));
    const site = callSite('src/Consumer.tsx', 'Consumer', 'Button');

    expect(edges).toContainEqual({
      kind: 'imports',
      sourceId: id('src/Consumer.tsx'),
      targetId: buttonId,
      rule: 'resolve/import',
      subKind: undefined,
      resolution: 'deterministic',
      confidence: undefined,
    });
    expect(edges).toContainEqual({
      kind: 'calls',
      sourceId: site,
      targetId: buttonId,
      rule: 'react/renders-import',
      subKind: 'react:renders',
      resolution: 'deterministic',
      confidence: undefined,
    });
    expect(edges).toContainEqual({
      kind: 'references',
      sourceId: site,
      targetId: id('src/ui/Button.tsx', term('Button'), param('label')),
      rule: 'react/binds-prop',
      subKind: 'react:propBinding',
      resolution: 'deterministic',
      confidence: undefined,
    });
  });

  it('resolves a single star re-export as INFERRED through the whole chain', async () => {
    const { edges } = await resolveFixtures();
    const widgetId = id('src/all/Widget.tsx', term('Widget'));
    const site = callSite('src/StarConsumer.tsx', 'StarConsumer', 'Widget');

    expect(edges).toContainEqual({
      kind: 'imports',
      sourceId: id('src/StarConsumer.tsx'),
      targetId: widgetId,
      rule: 'resolve/import',
      subKind: undefined,
      resolution: 'inferred',
      confidence: 'high',
    });
    expect(edges).toContainEqual({
      kind: 'calls',
      sourceId: site,
      targetId: widgetId,
      rule: 'react/renders-import',
      subKind: 'react:renders',
      resolution: 'inferred',
      confidence: 'high',
    });
  });

  it('binds a member-root render (Form.Item) to Form as INFERRED, with no prop edge', async () => {
    const { edges } = await resolveFixtures();
    const formId = id('src/Form.tsx', term('Form'));
    const site = callSite('src/MemberConsumer.tsx', 'MemberConsumer', 'Form.Item');

    expect(edges).toContainEqual({
      kind: 'calls',
      sourceId: site,
      targetId: formId,
      rule: 'react/renders-member-root',
      subKind: 'react:memberRoot',
      resolution: 'inferred',
      confidence: 'medium',
    });
    // No prop binding for a member-root (props belong to the unresolved member).
    expect(edges.some((edge) => edge.sourceId === site && edge.kind === 'references')).toBe(false);
  });

  it('resolves a namespace-member render (Forms.Form) to the EXACT export, deterministically (C10)', async () => {
    const { edges } = await resolveFixtures();
    const formId = id('src/Form.tsx', term('Form'));
    const site = callSite('src/NamespaceConsumer.tsx', 'NamespaceConsumer', 'Forms.Form');

    // `import * as Forms` then `<Forms.Form />` — the member IS the module export
    // `Form`, so it resolves exactly (not member-root), at full certainty.
    expect(edges).toContainEqual({
      kind: 'calls',
      sourceId: site,
      targetId: formId,
      rule: 'react/renders-namespace-member',
      subKind: 'react:renders',
      resolution: 'deterministic',
      confidence: undefined,
    });
  });

  it('leaves a namespace member that names no export unbound — no edge, no guess (C10)', async () => {
    const { edges } = await resolveFixtures();
    const missingSite = callSite('src/NamespaceConsumer.tsx', 'NamespaceConsumer', 'Forms.Missing');
    expect(edges.some((edge) => edge.sourceId === missingSite)).toBe(false);
  });

  it('resolves a name through MULTIPLE export * to its unique provider, deterministically', async () => {
    const { edges } = await resolveFixtures();
    // Alpha lives only in multi/first; Beta only in multi/second — each is proven
    // unique by probing both stars, so each resolves deterministically.
    expect(edges).toContainEqual({
      kind: 'imports',
      sourceId: id('src/MultiConsumer.tsx'),
      targetId: id('src/multi/first.tsx', term('Alpha')),
      rule: 'resolve/import',
      subKind: undefined,
      resolution: 'deterministic',
      confidence: undefined,
    });
    expect(edges).toContainEqual({
      kind: 'imports',
      sourceId: id('src/MultiConsumer.tsx'),
      targetId: id('src/multi/second.tsx', term('Beta')),
      rule: 'resolve/import',
      subKind: undefined,
      resolution: 'deterministic',
      confidence: undefined,
    });
  });

  it('leaves a name exported by TWO stars ambiguous — no edge, a diagnostic instead', async () => {
    const { edges, diagnostics } = await resolveFixtures();
    // Dup is exported by both multi/first and multi/second → never pick one.
    const dupEdge = edges.some(
      (edge) =>
        edge.kind === 'imports' &&
        edge.sourceId === id('src/MultiConsumer.tsx') &&
        (edge.targetId === id('src/multi/first.tsx', term('Dup')) ||
          edge.targetId === id('src/multi/second.tsx', term('Dup'))),
    );
    expect(dupEdge).toBe(false);
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: 'ambiguous-export', specifier: './multi/index.js' }),
    );
  });
});
