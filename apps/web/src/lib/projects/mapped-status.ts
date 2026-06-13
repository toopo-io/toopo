import type { MapView } from '@toopo/api-contracts';

/** A connected repository as the shell sidebar renders it. */
export interface RepoSummary {
  readonly id: string;
  readonly repoOwner: string;
  readonly repoName: string;
  /** Derived from the package-map probe — `false` means "not mapped yet". */
  readonly mapped: boolean;
}

/**
 * Whether a project's graph has been built — derived deterministically from the
 * served package map, never a stored flag (by design this stays frontend-only,
 * with no backend change). A project with at least one container node is mapped; an
 * empty map means "not mapped yet" (the deterministic noindex state). The probe
 * is the package-level map with a tiny limit, so this reads one row, not the graph.
 */
export function isProjectMapped(packageMap: Pick<MapView, 'nodes'>): boolean {
  return packageMap.nodes.length > 0;
}
