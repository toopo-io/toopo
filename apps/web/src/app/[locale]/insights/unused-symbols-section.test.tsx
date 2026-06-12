import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type { UnusedSymbolPage } from '@toopo/api-contracts';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../i18n/messages/en.json';

const unusedSymbols = vi.fn();
vi.mock('../../../lib/graph/api', () => ({
  graphApi: { unusedSymbols: (...args: unknown[]) => unusedSymbols(...args) },
}));

import { ProjectIdProvider } from '../../../lib/projects/project-context';
import { UnusedSymbolsSection } from './unused-symbols-section';

function renderSection(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={client}>
        <ProjectIdProvider projectId="p-test">
          <UnusedSymbolsSection locale="en" />
        </ProjectIdProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  unusedSymbols.mockReset();
});

describe('<UnusedSymbolsSection />', () => {
  it('distinguishes certain-unused from candidate, and shows the exported fact + residual', async () => {
    const page: UnusedSymbolPage = {
      items: [
        {
          node: { kind: 'symbol', id: 'sym:dead', name: 'dead', properties: {} },
          candidate: false,
          exported: true,
        },
        {
          node: { kind: 'symbol', id: 'sym:maybe', name: 'maybe', properties: {} },
          candidate: true,
          exported: false,
        },
      ],
      nextCursor: null,
      total: 2,
    };
    unusedSymbols.mockResolvedValue(page);
    renderSection();

    // Both rows render, with their honest trust labels (never "dead").
    expect(await screen.findByText('sym:dead')).toBeTruthy();
    expect(screen.getByText('sym:maybe')).toBeTruthy();
    expect(screen.getAllByText(messages.Insights.unused.certain).length).toBeGreaterThan(0);
    expect(screen.getAllByText(messages.Insights.unused.candidate).length).toBeGreaterThan(0);
    // The exported fact is surfaced, and the residual blind spot is disclosed.
    expect(screen.getByText(messages.Insights.unused.exported)).toBeTruthy();
    expect(screen.getByText(messages.Insights.unused.residual)).toBeTruthy();
  });

  it('shows the honest empty state when nothing is unused', async () => {
    unusedSymbols.mockResolvedValue({
      items: [],
      nextCursor: null,
      total: 0,
    } satisfies UnusedSymbolPage);
    renderSection();
    expect(await screen.findByText(messages.Insights.unused.empty)).toBeTruthy();
  });
});
