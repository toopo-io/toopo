'use client';

import { useQuery } from '@tanstack/react-query';
/**
 * Resolves the breadcrumb trail for the current scope. The pure shape comes from
 * `buildScopeTrail`; this hook fills in the labels that need the graph: at the
 * symbol level the scope is a file, so it fetches the file's display name and —
 * via `neighbors(in, contains)` — the package that contains it, giving a full
 * `Packages › package › file` trail. At the file/package levels no fetch is
 * needed (the scope id is already the package's name). Deep-linkable: the trail
 * is a function of the URL state plus these resolved labels.
 */
import type { MapLevel } from '@toopo/api-contracts';
import { graphApi } from '../../../lib/graph/api';
import { buildScopeTrail, type Crumb } from '../../../lib/graph/navigation';
import { nodeLabel } from '../../../lib/graph/node-label';

interface ResolvedAncestry {
  readonly scopeLabel: string;
  readonly packageAncestor?: { readonly id: string; readonly label: string };
}

export function useScopeTrail(
  level: MapLevel,
  scope: string | undefined,
  locale: string,
  rootLabel: string,
): Crumb[] {
  const needsResolve = level === 'symbol' && scope !== undefined;
  const { data } = useQuery<ResolvedAncestry>({
    queryKey: ['graph', 'scopeTrail', locale, scope],
    enabled: needsResolve,
    queryFn: async () => {
      const fileId = scope ?? '';
      const [detail, parents] = await Promise.all([
        graphApi.node({ id: fileId }, locale),
        graphApi.neighbors({ id: fileId, direction: 'in', kind: 'contains' }, locale),
      ]);
      const pkg = parents.items[0]?.node ?? null;
      return {
        scopeLabel: nodeLabel(detail.node),
        ...(pkg !== null ? { packageAncestor: { id: pkg.id, label: nodeLabel(pkg) } } : {}),
      };
    },
  });

  return buildScopeTrail({
    level,
    rootLabel,
    ...(scope !== undefined ? { scope } : {}),
    ...(data?.scopeLabel !== undefined ? { scopeLabel: data.scopeLabel } : {}),
    ...(data?.packageAncestor !== undefined ? { packageAncestor: data.packageAncestor } : {}),
  });
}
