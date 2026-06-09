'use client';

/**
 * React Query hooks over the Serve read API. Query keys are namespaced under
 * `['graph', …]` and include the locale (the API may localize messages) and the
 * exact query, so cache entries never collide across views. Defaults (staleTime,
 * retry) come from the app-wide `makeQueryClient`. More view hooks are added in
 * their slices; S1 needs the map.
 */
import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import type { MapQuery, MapView, NodeDetail } from '@toopo/api-contracts';
import { graphApi } from './api';

export const graphQueryKeys = {
  all: ['graph'] as const,
  map: (locale: string, query: MapQuery) => ['graph', 'map', locale, query] as const,
  node: (locale: string, id: string) => ['graph', 'node', locale, id] as const,
};

export function useGraphMap(
  query: MapQuery,
  locale: string,
  initialData?: MapView,
): UseQueryResult<MapView> {
  return useQuery({
    queryKey: graphQueryKeys.map(locale, query),
    queryFn: () => graphApi.map(query, locale),
    ...(initialData !== undefined ? { initialData } : {}),
  });
}

export function useGraphNode(id: string | undefined, locale: string): UseQueryResult<NodeDetail> {
  return useQuery({
    queryKey: graphQueryKeys.node(locale, id ?? ''),
    queryFn: () => graphApi.node({ id: id ?? '' }, locale),
    enabled: id !== undefined,
  });
}
