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
  MapQuery,
  MapView,
  NodeDetail,
  NodePage,
} from '@toopo/api-contracts';
import { graphApi } from './api';

/** Minimum query length before a search request is issued. */
export const SEARCH_MIN_LENGTH = 2;

export const graphQueryKeys = {
  all: ['graph'] as const,
  map: (locale: string, query: MapQuery) => ['graph', 'map', locale, query] as const,
  node: (locale: string, id: string) => ['graph', 'node', locale, id] as const,
  search: (locale: string, query: string) => ['graph', 'search', locale, query] as const,
  blastRadius: (locale: string, id: string) => ['graph', 'blastRadius', locale, id] as const,
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

export function useGraphSearch(query: string, locale: string): UseQueryResult<NodePage> {
  const trimmed = query.trim();
  return useQuery({
    queryKey: graphQueryKeys.search(locale, trimmed),
    queryFn: () => graphApi.search({ query: trimmed }, locale),
    enabled: trimmed.length >= SEARCH_MIN_LENGTH,
  });
}

export function useGraphBlastRadius(
  id: string | undefined,
  locale: string,
  enabled: boolean,
): UseQueryResult<BlastRadiusPage> {
  return useQuery({
    queryKey: graphQueryKeys.blastRadius(locale, id ?? ''),
    queryFn: () => graphApi.blastRadius({ id: id ?? '' }, locale),
    enabled: enabled && id !== undefined,
  });
}
