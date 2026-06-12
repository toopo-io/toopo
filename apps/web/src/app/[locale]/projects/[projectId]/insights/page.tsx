import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { routes } from '../../../../../lib/routes';
import { getServerSession } from '../../../../../lib/server-session';
import { InsightsView } from '../../../insights/insights-view';

// The views reflect the persisted graph, which changes out of band (the worker
// repopulates it); render dynamically so a hard refresh always shows the latest.
export const dynamic = 'force-dynamic';

interface ProjectInsightsPageProps {
  params: Promise<{ locale: string; projectId: string }>;
}

/**
 * The deterministic global derived views for a project (ADR-0029): name
 * collisions, unused symbols, and recursive cycles. Gated behind a session
 * (defense-in-depth + the return path, ADR-0022 §5); the
 * shell (workspace/repo sidebar, view tabs) comes from the projects layout.
 */
export default async function ProjectInsightsPage({
  params,
}: ProjectInsightsPageProps): Promise<ReactNode> {
  const { locale, projectId } = await params;
  setRequestLocale(locale);
  const session = await getServerSession();
  if (session === null) {
    redirect(routes.signinNext(locale, routes.projectInsights(locale, projectId)));
  }
  const t = await getTranslations('Insights');

  return (
    <main className="mx-auto flex h-[calc(100vh-4rem)] max-w-screen-2xl flex-col gap-4 overflow-auto px-6 py-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground text-sm">{t('subtitle')}</p>
      </header>
      <InsightsView projectId={projectId} locale={locale} />
    </main>
  );
}
