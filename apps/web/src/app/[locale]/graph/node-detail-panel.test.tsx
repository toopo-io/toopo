import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { NodeDetail } from '@toopo/api-contracts';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../i18n/messages/en.json';

const node = vi.fn();
vi.mock('../../../lib/graph/api', () => ({
  graphApi: { node: (...args: unknown[]) => node(...args) },
}));

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

function renderPanel(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={client}>
        <NodeDetailPanel nodeId="pkg/Button.tsx#Button" locale="en" onClose={() => undefined} />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
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
});
