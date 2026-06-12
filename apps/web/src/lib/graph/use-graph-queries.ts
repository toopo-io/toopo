'use client';

/**
 * React Query hooks over the Serve read API. Query keys are namespaced under
 * `['graph', …]` and include the locale (the API may localize messages) and the
 * exact query, so cache entries never collide across views. Defaults (staleTime,
 * retry) come from the app-wide `makeQueryClient`. More view hooks are added in
 * their slices; S1 needs the map.
 */
import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import type {
  BlastRadiusPage,
  CallBindings,
  CyclePage,
  MapQuery,
  MapView,
  NodeDetail,
  NodePage,
  UnusedSymbolPage,
} from '@toopo/api-contracts';
import { useProjectId } from '../projects/project-context';
import { graphApi } from './api';

/** Minimum query length before a search request is issued. */
export const SEARCH_MIN_LENGTH = 2;

// Query keys are namespaced by projectId first (ADR-0022 §3), so cache entries
// never bleed across projects even for identical view params or node ids.
export const graphQueryKeys = {
  all: ['graph'] as const,
  map: (projectId: string, locale: string, query: MapQuery) =>
    ['graph', projectId, 'map', locale, query] as const,
  node: (projectId: string, locale: string, id: string) =>
    ['graph', projectId, 'node', locale, id] as const,
  search: (projectId: string, locale: string, query: string) =>
    ['graph', projectId, 'search', locale, query] as const,
  blastRadius: (projectId: string, locale: string, id: string) =>
    ['graph', projectId, 'blastRadius', locale, id] as const,
  declarations: (projectId: string, locale: string, id: string) =>
    ['graph', projectId, 'declarations', locale, id] as const,
  callBindings: (projectId: string, locale: string, id: string) =>
    ['graph', projectId, 'callBindings', locale, id] as const,
  nameCollisions: (projectId: string, locale: string) =>
    ['graph', projectId, 'nameCollisions', locale] as const,
  unusedSymbols: (projectId: string, locale: string) =>
    ['graph', projectId, 'unusedSymbols', locale] as const,
  cycles: (projectId: string, locale: string) => ['graph', projectId, 'cycles', locale] as const,
};

export function useGraphMap(
  query: MapQuery,
  locale: string,
  initialData?: MapView,
): UseQueryResult<MapView> {
  const projectId = useProjectId();
  return useQuery({
    queryKey: graphQueryKeys.map(projectId, locale, query),
    queryFn: () => graphApi.map(projectId, query, locale),
    ...(initialData !== undefined ? { initialData } : {}),
  });
}

export function useGraphNode(id: string | undefined, locale: string): UseQueryResult<NodeDetail> {
  const projectId = useProjectId();
  return useQuery({
    queryKey: graphQueryKeys.node(projectId, locale, id ?? ''),
    queryFn: () => graphApi.node(projectId, { id: id ?? '' }, locale),
    enabled: id !== undefined,
  });
}

export function useGraphSearch(query: string, locale: string): UseQueryResult<NodePage> {
  const projectId = useProjectId();
  const trimmed = query.trim();
  return useQuery({
    queryKey: graphQueryKeys.search(projectId, locale, trimmed),
    queryFn: () => graphApi.search(projectId, { query: trimmed }, locale),
    enabled: trimmed.length >= SEARCH_MIN_LENGTH,
  });
}

export function useGraphBlastRadius(
  id: string | undefined,
  locale: string,
  enabled: boolean,
): UseQueryResult<BlastRadiusPage> {
  const projectId = useProjectId();
  return useQuery({
    queryKey: graphQueryKeys.blastRadius(projectId, locale, id ?? ''),
    queryFn: () => graphApi.blastRadius(projectId, { id: id ?? '' }, locale),
    enabled: enabled && id !== undefined,
  });
}

/** A symbol's contained declarations (D2) — loaded lazily on demand (ADR-0027). */
export function useGraphDeclarations(
  id: string,
  locale: string,
  enabled: boolean,
): UseQueryResult<NodePage> {
  const projectId = useProjectId();
  return useQuery({
    queryKey: graphQueryKeys.declarations(projectId, locale, id),
    queryFn: () => graphApi.declarations(projectId, { id }, locale),
    enabled,
  });
}

/** A call-site's argument→parameter bindings (D1) — loaded lazily on expand. */
export function useGraphCallBindings(
  id: string,
  locale: string,
  enabled: boolean,
): UseQueryResult<CallBindings> {
  const projectId = useProjectId();
  return useQuery({
    queryKey: graphQueryKeys.callBindings(projectId, locale, id),
    queryFn: () => graphApi.callBindings(projectId, { id }, locale),
    enabled,
  });
}

/** D5 (Insights) — top-level symbols sharing a name (ADR-0029); first page. */
export function useGraphNameCollisions(locale: string): UseQueryResult<NodePage> {
  const projectId = useProjectId();
  return useQuery({
    queryKey: graphQueryKeys.nameCollisions(projectId, locale),
    queryFn: () => graphApi.nameCollisions(projectId, {}, locale),
  });
}

/** D6 (Insights) — top-level symbols with no incoming usage (ADR-0029); first page. */
export function useGraphUnusedSymbols(locale: string): UseQueryResult<UnusedSymbolPage> {
  const projectId = useProjectId();
  return useQuery({
    queryKey: graphQueryKeys.unusedSymbols(projectId, locale),
    queryFn: () => graphApi.unusedSymbols(projectId, {}, locale),
  });
}

/** D7 (Insights) — recursive cycles (SCCs) of the dependency graph (ADR-0029); first page. */
export function useGraphCycles(locale: string): UseQueryResult<CyclePage> {
  const projectId = useProjectId();
  return useQuery({
    queryKey: graphQueryKeys.cycles(projectId, locale),
    queryFn: () => graphApi.cycles(projectId, {}, locale),
  });
}
