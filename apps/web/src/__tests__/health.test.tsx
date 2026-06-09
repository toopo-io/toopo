import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { HealthCheckResponse } from '@toopo/api-contracts';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HealthClient } from '../app/[locale]/health/health-client';
import messages from '../i18n/messages/en.json';

vi.mock('../lib/api-client', () => ({
  apiClient: {
    health: vi.fn().mockResolvedValue({
      status: 'ok',
      timestamp: '2026-05-14T12:00:00.000Z',
      uptime: 42,
      version: '0.0.0',
    } satisfies HealthCheckResponse),
  },
}));

afterEach(() => {
  vi.clearAllMocks();
});

function renderWithProviders(ui: ReactElement): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('<HealthClient />', () => {
  it('renders the initial server-fetched data immediately', () => {
    renderWithProviders(
      <HealthClient
        initialData={{
          status: 'ok',
          timestamp: '2026-05-14T12:00:00.000Z',
          uptime: 42,
          version: '0.0.0',
        }}
      />,
    );
    expect(screen.getByText('ok')).toBeInTheDocument();
    expect(screen.getByText('0.0.0')).toBeInTheDocument();
  });

  it('falls back to fetching when no initial data is supplied', async () => {
    renderWithProviders(<HealthClient initialData={null} />);
    await waitFor(() => {
      expect(screen.getByText('ok')).toBeInTheDocument();
    });
  });
});
