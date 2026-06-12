'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { JSX } from 'react';
import { routes } from '../../lib/routes';

interface ProjectViewTabsProps {
  readonly locale: string;
  readonly projectId: string;
}

/**
 * The per-project view switch (ADR-0029): Cartography (the canvas) and Insights
 * (the global derived views) are sibling surfaces, not overlays. Shown in the
 * topbar only when a project is selected; the active tab is derived from the path.
 */
export function ProjectViewTabs({ locale, projectId }: ProjectViewTabsProps): JSX.Element {
  const t = useTranslations('AppShell.tabs');
  const pathname = usePathname();
  const graphHref = routes.projectGraph(locale, projectId);
  const insightsHref = routes.projectInsights(locale, projectId);

  return (
    <nav className="flex items-center gap-1 text-[13px]" aria-label={t('aria')}>
      <Tab href={graphHref} active={pathname === graphHref} label={t('graph')} />
      <Tab href={insightsHref} active={pathname === insightsHref} label={t('insights')} />
    </nav>
  );
}

function Tab({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}): JSX.Element {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`rounded-md px-2.5 py-1 transition-colors ${
        active
          ? 'bg-accent font-medium text-foreground'
          : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
    </Link>
  );
}
