import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import messages from '../../i18n/messages/en.json';
import type { RepoSummary } from '../../lib/projects/mapped-status';
import type { WorkspaceSummary } from '../../lib/workspaces/workspace';
import { ThemeProvider } from '../../providers/theme-provider';
import { AppShell } from './app-shell';

vi.mock('next/navigation', () => ({
  useParams: () => ({ projectId: 'p2' }),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/en/projects/p2/graph',
}));

const WORKSPACES: WorkspaceSummary[] = [
  { id: 'ws_1', name: 'Acme Labs', slug: 'acme', logo: null },
];
const REPOS: RepoSummary[] = [
  { id: 'p1', repoOwner: 'acme', repoName: 'notes-app', mapped: true },
  { id: 'p2', repoOwner: 'acme', repoName: 'fresh-repo', mapped: false },
];

function renderShell(ui: ReactElement): void {
  render(
    <ThemeProvider>
      <NextIntlClientProvider locale="en" messages={messages}>
        {ui}
      </NextIntlClientProvider>
    </ThemeProvider>,
  );
}

describe('<AppShell />', () => {
  it('shows the active workspace, the repo list, and the children', () => {
    renderShell(
      <AppShell workspaces={WORKSPACES} repos={REPOS} activeWorkspaceId="ws_1" locale="en">
        <p>canvas surface</p>
      </AppShell>,
    );
    expect(screen.getAllByText('Acme Labs').length).toBeGreaterThan(0);
    expect(screen.getByText('notes-app')).toBeInTheDocument();
    // The active repo (p2) shows in both the sidebar and the breadcrumb leaf.
    expect(screen.getAllByText('fresh-repo').length).toBeGreaterThan(0);
    expect(screen.getByText('canvas surface')).toBeInTheDocument();
  });

  it('marks a mapped repo and flags an unmapped one as "not mapped yet"', () => {
    renderShell(
      <AppShell workspaces={WORKSPACES} repos={REPOS} activeWorkspaceId="ws_1" locale="en">
        <p>canvas</p>
      </AppShell>,
    );
    expect(screen.getByText('mapped')).toBeInTheDocument();
    expect(screen.getByText('not mapped yet')).toBeInTheDocument();
  });

  it('puts the active repo in the breadcrumb', () => {
    renderShell(
      <AppShell workspaces={WORKSPACES} repos={REPOS} activeWorkspaceId="ws_1" locale="en">
        <p>canvas</p>
      </AppShell>,
    );
    // useParams → projectId p2 (fresh-repo), so it is the breadcrumb leaf.
    const breadcrumb = screen.getByLabelText('breadcrumb');
    expect(breadcrumb).toHaveTextContent('fresh-repo');
  });
});
