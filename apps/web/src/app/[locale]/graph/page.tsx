import type { MapLevel, MapView } from '@toopo/api-contracts';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { graphApi } from '../../../lib/graph/api';
import { GraphExplorer } from './graph-explorer';

/**
 * The coarsest containment tier that actually has nodes. A filesystem ingest may
 * not synthesize Package/Repo containers (they are optional, ADR-0015 §2), so the
 * top of the map can be `file`. We pick the first non-empty tier rather than show
 * an empty package map for a populated graph (graceful degradation — a cardinal
 * principle). Symbol level is never a root: it requires a scope.
 */
async function resolveInitialMap(
  locale: string,
): Promise<{ level: MapLevel; map: MapView | null }> {
  for (const level of ['package', 'file'] as const) {
    const map = await graphApi.map({ level }, locale).catch(() => null);
    if (map === null) {
      return { level, map: null };
    }
    if (map.nodes.length > 0) {
      return { level, map };
    }
  }
  // Nothing populated at any tier — return the package level's empty map honestly.
  return { level: 'package', map: { level: 'package', nodes: [], edges: [], truncated: false } };
}

// The map reflects the persisted graph, which changes out of band (the worker
// repopulates it); render dynamically so a hard refresh always shows the latest.
export const dynamic = 'force-dynamic';

interface GraphPageProps {
  params: Promise<{ locale: string }>;
}

export default async function GraphPage({ params }: GraphPageProps): Promise<ReactNode> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Graph');
  // Server-fetch the coarsest populated map for instant first paint; the client
  // hydrates and refreshes it. A failure degrades to a client-side fetch (map = null).
  const { level: initialLevel, map: initialMap } = await resolveInitialMap(locale);

  return (
    <main className="mx-auto flex h-[calc(100vh-4rem)] max-w-screen-2xl flex-col gap-4 px-6 py-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground text-sm">{t('subtitle')}</p>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-muted/20">
        <GraphExplorer initialLevel={initialLevel} initialMap={initialMap} />
      </div>
    </main>
  );
}
