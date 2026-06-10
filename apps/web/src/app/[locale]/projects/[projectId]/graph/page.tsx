import type { MapLevel, MapView } from '@toopo/api-contracts';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { type ReactNode, Suspense } from 'react';
import { graphApi } from '../../../../../lib/graph/api';
import { routes } from '../../../../../lib/routes';
import { getServerSession } from '../../../../../lib/server-session';
import { GraphExplorer } from '../../../graph/graph-explorer';

/**
 * The coarsest containment tier that actually has nodes (ADR-0015 §2): a
 * filesystem ingest may not synthesize Package/Repo containers, so the top of the
 * map can be `file`. We pick the first non-empty tier rather than show an empty
 * package map for a populated graph (graceful degradation). The session cookie is
 * forwarded so the gated, project-scoped API (ADR-0022 §5) authorizes the SSR
 * probe; on any failure the map degrades to a client-side fetch (`map = null`).
 */
async function resolveInitialMap(
  projectId: string,
  locale: string,
): Promise<{ level: MapLevel; map: MapView | null }> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((entry) => `${entry.name}=${entry.value}`)
    .join('; ');
  const init: RequestInit = { headers: { cookie: cookieHeader } };

  for (const level of ['package', 'file'] as const) {
    const map = await graphApi.map(projectId, { level }, locale, init).catch(() => null);
    if (map === null) {
      return { level, map: null };
    }
    if (map.nodes.length > 0) {
      return { level, map };
    }
  }
  return { level: 'package', map: { level: 'package', nodes: [], edges: [], truncated: false } };
}

// The map reflects the persisted graph, which changes out of band (the worker
// repopulates it); render dynamically so a hard refresh always shows the latest.
export const dynamic = 'force-dynamic';

interface ProjectGraphPageProps {
  params: Promise<{ locale: string; projectId: string }>;
}

export default async function ProjectGraphPage({
  params,
}: ProjectGraphPageProps): Promise<ReactNode> {
  const { locale, projectId } = await params;
  setRequestLocale(locale);
  // Gate the graph behind auth (ADR-0022 §5, Fork 5): the middleware redirects an
  // anonymous request before this runs; this server check is defense-in-depth and
  // also yields the post-signin return path.
  const session = await getServerSession();
  if (session === null) {
    redirect(routes.signinNext(locale, routes.projectGraph(locale, projectId)));
  }
  const t = await getTranslations('Graph');
  const { level: initialLevel, map: initialMap } = await resolveInitialMap(projectId, locale);

  return (
    <main className="mx-auto flex h-[calc(100vh-4rem)] max-w-screen-2xl flex-col gap-4 px-6 py-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground text-sm">{t('subtitle')}</p>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-muted/20">
        {/* GraphExplorer reads useSearchParams (the URL-encoded view state), which
            Next requires under a Suspense boundary in the production build. */}
        <Suspense fallback={null}>
          <GraphExplorer
            projectId={projectId}
            initialLevel={initialLevel}
            initialMap={initialMap}
          />
        </Suspense>
      </div>
    </main>
  );
}
