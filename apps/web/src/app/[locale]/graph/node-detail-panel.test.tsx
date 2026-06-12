import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { CallBindings, NodeDetail, NodePage } from '@toopo/api-contracts';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../i18n/messages/en.json';

const node = vi.fn();
const declarations = vi.fn();
const callBindings = vi.fn();
vi.mock('../../../lib/graph/api', () => ({
  graphApi: {
    node: (...args: unknown[]) => node(...args),
    declarations: (...args: unknown[]) => declarations(...args),
    callBindings: (...args: unknown[]) => callBindings(...args),
  },
}));

import { ProjectIdProvider } from '../../../lib/projects/project-context';
import { NodeDetailPanel } from './node-detail-panel';

const DETAIL: NodeDetail = {
  node: {
    kind: 'symbol',
    id: 'pkg/Button.tsx#Button',
    name: 'Button',
    subKind: 'react:component',
    analysis: { status: 'analyzed' },
    properties: {},
  },
  declaredInterface: {
    items: [
      {
        kind: 'symbol',
        id: 'pkg/Button.tsx#Button.label',
        name: 'label',
        subKind: 'react:prop',
        properties: {},
      },
    ],
    nextCursor: null,
  },
  incoming: {
    items: [
      {
        edge: {
          kind: 'references',
          sourceId: 'ext#',
          targetId: 'pkg/Button.tsx#Button',
          provenance: { pass: 'resolve', rule: 'r' },
          resolution: 'inferred',
          confidence: 'low',
        },
        node: null,
      },
    ],
    nextCursor: null,
  },
  outgoing: {
    items: [
      {
        edge: {
          kind: 'calls',
          sourceId: 'pkg/Button.tsx#Button',
          targetId: 'pkg/Icon.tsx#Icon',
          provenance: { pass: 'parse', rule: 'r' },
          resolution: 'deterministic',
        },
        node: { kind: 'symbol', id: 'pkg/Icon.tsx#Icon', name: 'Icon', properties: {} },
      },
    ],
    nextCursor: null,
  },
  callSites: { items: [], nextCursor: null },
};

function renderPanel(extra?: Partial<Parameters<typeof NodeDetailPanel>[0]>): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={client}>
        <ProjectIdProvider projectId="p-test">
          <NodeDetailPanel
            nodeId="pkg/Button.tsx#Button"
            locale="en"
            onClose={() => undefined}
            blastActive={false}
            onToggleBlast={() => undefined}
            blastLoading={false}
            {...extra}
          />
        </ProjectIdProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

const FUNCTION_DETAIL: NodeDetail = {
  node: {
    kind: 'symbol',
    id: 'pkg/util.ts#clamp',
    name: 'clamp',
    subKind: 'ts:function',
    properties: {
      returnType: 'number',
      jsdoc:
        '/**\n * Clamps a value to a max.\n * @param value the input\n * @returns the clamped value\n */',
    },
  },
  declaredInterface: {
    items: [
      {
        kind: 'symbol',
        id: 'pkg/util.ts#clamp.value',
        name: 'value',
        subKind: 'ts:parameter',
        properties: { type: 'number' },
      },
    ],
    nextCursor: null,
  },
  incoming: { items: [], nextCursor: null },
  outgoing: { items: [], nextCursor: null },
  callSites: {
    items: [
      {
        kind: 'callSite',
        id: 'pkg/util.ts#clamp@0',
        enclosingSymbolId: 'pkg/util.ts#clamp',
        callee: 'min',
        ordinal: 0,
        payload: [],
        properties: {},
      },
    ],
    nextCursor: null,
  },
};

afterEach(() => {
  cleanup();
  node.mockReset();
  declarations.mockReset();
  callBindings.mockReset();
});

describe('<NodeDetailPanel />', () => {
  it('renders the node header, parameters, and neighbours with per-row trust', async () => {
    node.mockResolvedValue(DETAIL);
    renderPanel();

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Button' })).toBeInTheDocument(),
    );
    // Parameters + neighbours.
    expect(screen.getByText('label')).toBeInTheDocument();
    expect(screen.getByText('Icon')).toBeInTheDocument();
    // The unresolved caller shows an honest "(external)" label, never invented.
    expect(screen.getByText(messages.Graph.panel.external)).toBeInTheDocument();
    // An inferred incoming edge surfaces the plain-language callout.
    expect(screen.getByText(messages.Graph.panel.inferredCallout)).toBeInTheDocument();

    // Both trust kinds are visibly marked — the inferred caller and the
    // deterministic callee each render their distinct swatch.
    const container = screen.getByRole('complementary');
    expect(container.querySelector('[data-trust="inferred"]')).not.toBeNull();
    expect(container.querySelector('[data-trust="deterministic"]')).not.toBeNull();
  });

  it('composes the signature and renders JSDoc verbatim (F2)', async () => {
    node.mockResolvedValue(FUNCTION_DETAIL);
    renderPanel({ nodeId: 'pkg/util.ts#clamp' });

    await waitFor(() =>
      expect(screen.getByText('clamp(value: number): number')).toBeInTheDocument(),
    );
    expect(screen.getByText('Clamps a value to a max.')).toBeInTheDocument();
    expect(screen.getByText('value the input')).toBeInTheDocument();
    expect(screen.getByText('the clamped value')).toBeInTheDocument();
    // No inferred relationship here, so no callout.
    expect(screen.queryByText(messages.Graph.panel.inferredCallout)).toBeNull();
  });

  it('loads local variables and nested functions on demand (lazy, ADR-0027)', async () => {
    node.mockResolvedValue(FUNCTION_DETAIL);
    const members: NodePage = {
      items: [
        {
          kind: 'symbol',
          id: 'pkg/util.ts#clamp.total',
          name: 'total',
          subKind: 'ts:variable',
          properties: {},
        },
        {
          kind: 'symbol',
          id: 'pkg/util.ts#clamp.round',
          name: 'round',
          subKind: 'ts:function',
          properties: {},
        },
      ],
      nextCursor: null,
    };
    declarations.mockResolvedValue(members);
    renderPanel({ nodeId: 'pkg/util.ts#clamp' });

    await waitFor(() =>
      expect(screen.getByText(messages.Graph.panel.showMembers)).toBeInTheDocument(),
    );
    // Not fetched until the viewer asks for it.
    expect(declarations).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText(messages.Graph.panel.showMembers));
    await waitFor(() => expect(screen.getByText('total')).toBeInTheDocument());
    expect(screen.getByText('round')).toBeInTheDocument();
  });

  it('stitches call-site arguments to the parameters they bind, marking the unbound (D1)', async () => {
    node.mockResolvedValue(FUNCTION_DETAIL);
    const bindings: CallBindings = {
      callSite: {
        kind: 'callSite',
        id: 'pkg/util.ts#clamp@0',
        enclosingSymbolId: 'pkg/util.ts#clamp',
        callee: 'min',
        ordinal: 0,
        payload: [],
        properties: {},
      },
      bindings: [
        {
          argument: { ordinal: 0, name: 'arg', passKind: 'named', resolution: 'deterministic' },
          parameter: { kind: 'symbol', id: 'pkg#min.low', name: 'low', properties: {} },
          edge: {
            kind: 'references',
            sourceId: 'pkg/util.ts#clamp@0',
            targetId: 'pkg#min.low',
            provenance: { pass: 'resolve', rule: 'r' },
            resolution: 'deterministic',
          },
        },
        {
          argument: { ordinal: 1, passKind: 'spread', resolution: 'inferred', confidence: 'low' },
          parameter: null,
          edge: null,
        },
      ],
    };
    callBindings.mockResolvedValue(bindings);
    renderPanel({ nodeId: 'pkg/util.ts#clamp' });

    await waitFor(() => expect(screen.getByText('min(…)')).toBeInTheDocument());
    expect(callBindings).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('min(…)'));
    // The bound argument names its parameter; the unbound one is marked honestly.
    await waitFor(() => expect(screen.getByText('low')).toBeInTheDocument());
    expect(screen.getByText(messages.Graph.panel.unbound)).toBeInTheDocument();
  });

  it('shows a load error honestly', async () => {
    node.mockRejectedValue(new Error('nope'));
    renderPanel();
    await waitFor(() => expect(screen.getByText(/Failed to load node: nope/)).toBeInTheDocument());
  });

  it('marks each blast-radius dependent certain (solid) vs possible (dashed)', async () => {
    node.mockResolvedValue(DETAIL);
    renderPanel({
      blastActive: true,
      blastPage: {
        items: [
          {
            nodeId: 'certain#',
            depth: 1,
            pathResolution: 'deterministic',
            node: { kind: 'symbol', id: 'certain#', name: 'CertainDep', properties: {} },
          },
          {
            nodeId: 'possible#',
            depth: 2,
            pathResolution: 'inferred',
            node: { kind: 'symbol', id: 'possible#', name: 'PossibleDep', properties: {} },
          },
        ],
        nextCursor: null,
        truncated: true,
      },
    });
    const blast = (await screen.findByText(messages.Graph.blast.title)).closest('section');
    expect(blast).not.toBeNull();
    const section = blast as HTMLElement;
    expect(screen.getByText('CertainDep')).toBeInTheDocument();
    expect(screen.getByText('PossibleDep')).toBeInTheDocument();
    // Per-node trust replaces the old caveat: one solid (certain) and one dashed
    // (possible) trust mark, in the same solid/dashed language as the edges (ADR-0021).
    expect(section.querySelector('[data-trust="deterministic"]')).not.toBeNull();
    expect(section.querySelector('[data-trust="inferred"]')).not.toBeNull();
    expect(screen.getByText(messages.Graph.blast.truncated)).toBeInTheDocument();
  });

  it('no longer renders a panel-level certainty caveat', () => {
    expect((messages.Graph.blast as Record<string, string>)['caveat']).toBeUndefined();
  });
});
