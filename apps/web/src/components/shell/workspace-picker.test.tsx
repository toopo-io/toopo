import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../i18n/messages/en.json';
import type { WorkspaceSummary } from '../../lib/workspaces/workspace';

const setActive = vi.fn();
vi.mock('../../lib/auth-client', () => ({
  authClient: { organization: { setActive: (...args: unknown[]) => setActive(...args) } },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { WorkspacePicker } from './workspace-picker';

const WORKSPACES: WorkspaceSummary[] = [
  { id: 'ws1', name: 'Alpha', slug: 'alpha', logo: null },
  { id: 'ws2', name: 'Beta', slug: 'beta', logo: null },
];

function renderPicker(activeId: string): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <WorkspacePicker workspaces={WORKSPACES} activeId={activeId} />
    </NextIntlClientProvider>,
  );
}

afterEach(() => setActive.mockReset());

describe('<WorkspacePicker />', () => {
  it('surfaces a failed workspace switch instead of a silent no-op', async () => {
    setActive.mockRejectedValue(new Error('nope'));
    renderPicker('ws1');

    fireEvent.click(screen.getByRole('button', { name: /Alpha/ })); // open the dropdown
    fireEvent.click(screen.getByRole('button', { name: /Beta/ })); // choose another workspace

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(messages.AppShell.switchError),
    );
  });
});
