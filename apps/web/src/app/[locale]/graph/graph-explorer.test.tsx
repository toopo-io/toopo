import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { MapView } from '@toopo/api-contracts';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import messages from '../../../i18n/messages/en.json';

// React Flow measures its container via ResizeObserver and reads matchMedia;
// jsdom has neither. Stub them so the canvas mounts without throwing.
const noop = (): void => undefined;
beforeAll(() => {
  class ResizeObserverStub {
    observe = noop;
    unobserve = noop;
    disconnect = noop;
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
  globalThis.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: noop,
    removeEventListener: noop,
    addListener: noop,
    removeListener: noop,
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof globalThis.matchMedia;
});

// The explorer reads its view from the URL via next/navigation.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/en/graph',
  useSearchParams: () => new URLSearchParams(''),
}));

const map = vi.fn();
vi.mock('../../../lib/graph/api', () => ({
  graphApi: { map: (...args: unknown[]) => map(...args) },
}));

// ELK runs an async layout we don't need in a DOM test — return fixed positions.
vi.mock('../../../lib/graph/elk-layout', () => ({
  layoutGraph: vi.fn().mockResolvedValue(new Map([['pkgA', { x: 0, y: 0 }]])),
}));

import { GraphExplorer } from './graph-explorer';

function renderExplorer(initialMap: MapView | null): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui: ReactElement = (
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={client}>
        <GraphExplorer initialLevel="package" initialMap={initialMap} />
      </QueryClientProvider>
    </NextIntlClientProvider>
  );
  render(ui);
}

const packageNode = (id: string, name: string, childCount: number) => ({
  node: { kind: 'package' as const, id, name, properties: {} },
  childCount,
});

afterEach(() => {
  map.mockReset();
});

describe('<GraphExplorer /> (V1 package map)', () => {
  it('renders the persistent trust legend over a populated map', async () => {
    renderExplorer({
      level: 'package',
      nodes: [packageNode('pkgA', '@toopo/web', 4)],
      edges: [],
      truncated: false,
    });
    expect(screen.getByText(messages.Graph.legend.title)).toBeInTheDocument();
    expect(screen.getByText(messages.Graph.legend.deterministic)).toBeInTheDocument();
    expect(screen.getByText(messages.Graph.legend.inferred)).toBeInTheDocument();
    // The breadcrumb roots at the entry tier ("Packages").
    expect(
      screen.getByRole('navigation', { name: messages.Graph.breadcrumb.aria }),
    ).toHaveTextContent(messages.Graph.level.package);
  });

  it('shows an honest truncated banner when the view is capped', () => {
    renderExplorer({
      level: 'package',
      nodes: [packageNode('pkgA', '@toopo/web', 4)],
      edges: [],
      truncated: true,
    });
    expect(screen.getByText(messages.Graph.truncated)).toBeInTheDocument();
  });

  it('shows an empty-state message when there is no graph', () => {
    renderExplorer({ level: 'package', nodes: [], edges: [], truncated: false });
    expect(screen.getByText(messages.Graph.empty)).toBeInTheDocument();
  });

  it('surfaces a load error when there is no initial data and the fetch fails', async () => {
    map.mockRejectedValue(new Error('boom'));
    renderExplorer(null);
    await waitFor(() => {
      expect(screen.getByText(/Failed to load the map: boom/)).toBeInTheDocument();
    });
  });
});
