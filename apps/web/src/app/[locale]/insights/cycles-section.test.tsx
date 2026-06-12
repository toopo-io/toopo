import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type { CyclePage } from '@toopo/api-contracts';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../i18n/messages/en.json';

const cycles = vi.fn();
vi.mock('../../../lib/graph/api', () => ({
  graphApi: { cycles: (...args: unknown[]) => cycles(...args) },
}));

import { ProjectIdProvider } from '../../../lib/projects/project-context';
import { CyclesSection } from './cycles-section';

function renderSection(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={client}>
        <ProjectIdProvider projectId="p-test">
          <CyclesSection locale="en" />
        </ProjectIdProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  cycles.mockReset();
});

describe('<CyclesSection />', () => {
  it('renders members and the trust label, distinguishing certain from candidate', async () => {
    const page: CyclePage = {
      items: [
        { id: 'A', members: ['A', 'B'], length: 2, candidate: false, truncated: false },
        { id: 'C', members: ['C', 'D'], length: 2, candidate: true, truncated: false },
      ],
      nextCursor: null,
      total: 2,
    };
    cycles.mockResolvedValue(page);
    renderSection();

    expect(await screen.findByText('A')).toBeTruthy();
    expect(screen.getByText('D')).toBeTruthy();
    expect(screen.getByText(messages.Insights.cycles.certain)).toBeTruthy();
    expect(screen.getByText(messages.Insights.cycles.candidate)).toBeTruthy();
  });

  it('shows the honest empty state for an acyclic graph', async () => {
    cycles.mockResolvedValue({ items: [], nextCursor: null, total: 0 } satisfies CyclePage);
    renderSection();
    expect(await screen.findByText(messages.Insights.cycles.empty)).toBeTruthy();
  });
});
