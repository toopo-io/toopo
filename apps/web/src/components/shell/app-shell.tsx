'use client';

import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { JSX, ReactNode } from 'react';
import type { RepoSummary } from '../../lib/projects/mapped-status';
import type { WorkspaceSummary } from '../../lib/workspaces/workspace';
import { workspaceGlyph } from '../../lib/workspaces/workspace';
import { LocaleSwitcher } from '../locale-switcher';
import { BrandMark } from './brand-mark';
import { ProjectViewTabs } from './project-view-tabs';
import { RepoList } from './repo-list';
import { ThemeToggle } from './theme-toggle';
import { WorkspacePicker } from './workspace-picker';

interface AppShellProps {
  readonly workspaces: readonly WorkspaceSummary[];
  readonly repos: readonly RepoSummary[];
  readonly activeWorkspaceId: string | null;
  readonly locale: string;
  readonly children: ReactNode;
}

/**
 * The workspace-aware explorer shell (Phase C1): a fixed topbar (brand,
 * workspace→repo breadcrumb, theme toggle) over a sidebar (workspace picker +
 * repository list) and the main surface. The shell is the app — repo selection
 * lives in the sidebar, not a separate grid (the standalone picker folds in here).
 */
export function AppShell({
  workspaces,
  repos,
  activeWorkspaceId,
  locale,
  children,
}: AppShellProps): JSX.Element {
  const t = useTranslations('AppShell');
  const params = useParams<{ projectId?: string }>();
  const activeWorkspace =
    workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? workspaces[0] ?? null;
  const activeRepo = repos.find((repo) => repo.id === params.projectId) ?? null;

  return (
    <div className="grid h-screen grid-rows-[52px_1fr]">
      <header className="flex items-center gap-4 border-border border-b bg-card px-4">
        <div className="flex items-center gap-2.5">
          <BrandMark className="size-5.5" />
          <span className="font-mono font-semibold text-[15px] tracking-tight lowercase">
            toopo
          </span>
        </div>
        <nav
          className="flex items-center gap-2 text-muted-foreground text-[13px]"
          aria-label="breadcrumb"
        >
          {activeWorkspace !== null ? (
            <span className="flex items-center gap-1.5">
              <span className="grid size-4.5 place-items-center rounded-[5px] bg-primary font-bold text-[10px] text-primary-foreground">
                {workspaceGlyph(activeWorkspace.name)}
              </span>
              {activeWorkspace.name}
            </span>
          ) : null}
          {activeRepo !== null ? (
            <>
              <span className="text-faint" aria-hidden="true">
                /
              </span>
              <span className="font-medium font-mono text-[13px] text-foreground">
                {activeRepo.repoName}
              </span>
            </>
          ) : null}
        </nav>
        <div className="flex-1" />
        {activeRepo !== null ? <ProjectViewTabs locale={locale} projectId={activeRepo.id} /> : null}
        <ThemeToggle />
        <LocaleSwitcher />
      </header>

      <div className="grid min-h-0 grid-cols-[224px_1fr]">
        <aside className="flex min-h-0 flex-col border-border border-r bg-card">
          <div className="px-3.5 pt-4 pb-2">
            <p className="mb-2 font-mono text-[10px] text-faint uppercase tracking-[0.12em]">
              {t('workspace')}
            </p>
            <WorkspacePicker workspaces={workspaces} activeId={activeWorkspaceId} />
          </div>
          <div className="px-3.5 pt-2 pb-1">
            <p className="font-mono text-[10px] text-faint uppercase tracking-[0.12em]">
              {t('repositories')}
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-2 pb-4">
            <RepoList repos={repos} locale={locale} />
          </div>
        </aside>

        <main className="min-w-0 overflow-hidden bg-canvas">{children}</main>
      </div>
    </div>
  );
}
