import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type { NodePage } from '@toopo/api-contracts';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../i18n/messages/en.json';

const nameCollisions = vi.fn();
vi.mock('../../../lib/graph/api', () => ({
  graphApi: { nameCollisions: (...args: unknown[]) => nameCollisions(...args) },
}));

import { ProjectIdProvider } from '../../../lib/projects/project-context';
import { NameCollisionsSection } from './name-collisions-section';

function renderSection(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={client}>
        <ProjectIdProvider projectId="p-test">
          <NameCollisionsSection locale="en" />
        </ProjectIdProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  nameCollisions.mockReset();
});

describe('<NameCollisionsSection />', () => {
  it('groups colliding declarations under their shared name', async () => {
    const page: NodePage = {
      items: [
        {
          kind: 'symbol',
          id: 'sym:a:Button',
          name: 'Button',
          subKind: 'react:component',
          properties: {},
        },
        {
          kind: 'symbol',
          id: 'sym:b:Button',
          name: 'Button',
          subKind: 'react:component',
          properties: {},
        },
      ],
      nextCursor: null,
      total: 2,
    };
    nameCollisions.mockResolvedValue(page);
    renderSection();

    // The shared name heads the group, with the member count and both ids.
    expect(await screen.findByText('Button')).toBeTruthy();
    expect(screen.getByText('2 declarations')).toBeTruthy();
    expect(screen.getByText('sym:a:Button')).toBeTruthy();
    expect(screen.getByText('sym:b:Button')).toBeTruthy();
  });

  it('shows the honest empty state when no names collide', async () => {
    nameCollisions.mockResolvedValue({ items: [], nextCursor: null, total: 0 } satisfies NodePage);
    renderSection();
    expect(await screen.findByText(messages.Insights.collisions.empty)).toBeTruthy();
  });
});
