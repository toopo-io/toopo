import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { forwardedCookieHeader } from '../../../lib/cookie-header';
import { listMyProjects } from '../../../lib/projects/api';
import { ConnectRepositoryButton } from './connect-repository-button';

// The session is enforced by the shell layout; this only decides the landing copy.
export const dynamic = 'force-dynamic';

interface ProjectsPageProps {
  params: Promise<{ locale: string }>;
}

/**
 * The shell's main surface when no repository is selected. With repos connected
 * it invites the user to pick one from the sidebar; with none, it offers the
 * connect flow — the empty/fresh-workspace state, kept graceful (Phase C1).
 */
export default async function ProjectsPage({ params }: ProjectsPageProps): Promise<ReactNode> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('AppShell');

  const page = await listMyProjects(locale, {
    headers: { cookie: await forwardedCookieHeader() },
  }).catch(() => null);
  const hasRepos = (page?.items.length ?? 0) > 0;

  return (
    <div className="grid h-full place-items-center p-10 text-center">
      <div className="flex max-w-sm flex-col items-center gap-3">
        <div className="size-12.5 rounded-[9px] border border-line-strong border-dashed" />
        <h2 className="font-mono font-semibold text-base">
          {hasRepos ? t('empty.selectRepo') : t('empty.noRepos')}
        </h2>
        <p className="text-muted-foreground text-[12.5px] leading-relaxed">
          {hasRepos ? t('empty.selectRepoHint') : t('empty.noReposHint')}
        </p>
        {hasRepos ? null : <ConnectRepositoryButton />}
      </div>
    </div>
  );
}
