import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { NodePage } from '@toopo/api-contracts';
import type { Node } from '@toopo/core';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../i18n/messages/en.json';

const search = vi.fn();
vi.mock('../../../lib/graph/api', () => ({
  graphApi: { search: (...args: unknown[]) => search(...args) },
}));

import { ProjectIdProvider } from '../../../lib/projects/project-context';
import { SearchBox } from './search-box';

const PAGE: NodePage = {
  items: [{ kind: 'package', id: '@toopo/db', name: '@toopo/db', properties: {} }],
  nextCursor: null,
};

function renderBox(onJump: (node: Node) => void): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={client}>
        <ProjectIdProvider projectId="p-test">
          <SearchBox locale="en" onJump={onJump} />
        </ProjectIdProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  search.mockReset();
});

describe('<SearchBox />', () => {
  it('queries on debounced input and jumps to a chosen result', async () => {
    search.mockResolvedValue(PAGE);
    const onJump = vi.fn();
    renderBox(onJump);

    fireEvent.change(screen.getByRole('searchbox', { name: messages.Graph.search.aria }), {
      target: { value: 'db' },
    });

    const result = await screen.findByText('@toopo/db');
    fireEvent.click(result);
    expect(onJump).toHaveBeenCalledWith(PAGE.items[0]);
  });

  it('does not query for input below the minimum length', async () => {
    search.mockResolvedValue(PAGE);
    renderBox(vi.fn());
    fireEvent.change(screen.getByRole('searchbox', { name: messages.Graph.search.aria }), {
      target: { value: 'd' },
    });
    // Give the debounce time to (not) fire.
    await waitFor(() => expect(search).not.toHaveBeenCalled());
  });
});
