import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { NodeDetail } from '@toopo/api-contracts';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../i18n/messages/en.json';

const node = vi.fn();
vi.mock('../../../lib/graph/api', () => ({
  graphApi: { node: (...args: unknown[]) => node(...args) },
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

afterEach(() => {
  cleanup();
  node.mockReset();
});

describe('<NodeDetailPanel />', () => {
  it('renders the node header, declared interface, and neighbours with per-row trust', async () => {
    node.mockResolvedValue(DETAIL);
    renderPanel();

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Button' })).toBeInTheDocument(),
    );
    // Declared interface + neighbours.
    expect(screen.getByText('label')).toBeInTheDocument();
    expect(screen.getByText('Icon')).toBeInTheDocument();
    // The unresolved caller shows an honest "(external)" label, never invented.
    expect(screen.getByText(messages.Graph.panel.external)).toBeInTheDocument();

    // Both trust kinds are visibly marked — the inferred caller and the
    // deterministic callee each render their distinct swatch.
    const container = screen.getByRole('complementary');
    expect(container.querySelector('[data-trust="inferred"]')).not.toBeNull();
    expect(container.querySelector('[data-trust="deterministic"]')).not.toBeNull();
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
