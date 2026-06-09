/**
 * The cartography explorer's whole view is encoded in the URL search params, so
 * every state is deep-linkable and shareable (ADR-0020 Fork 3). This module is
 * the PURE core — parse params → typed state, and serialize state → params —
 * with no React, so it is exhaustively unit-testable. `useGraphViewState` wraps
 * it over Next's router.
 *
 *   level  — the map containment level (package | file | symbol).
 *   scope  — the container the level is scoped to (REQUIRED at symbol level, per
 *            the Serve contract; an unscoped symbol level degrades to package).
 *   node   — the selected node id whose detail panel is open (V2).
 *   blast  — whether the blast-radius overlay is on for the selected node (V4).
 */
import { type MapLevel, MapLevelSchema } from '@toopo/api-contracts';

export interface GraphViewState {
  readonly level: MapLevel;
  readonly scope?: string;
  readonly node?: string;
  readonly blast: boolean;
}

export const DEFAULT_GRAPH_VIEW_STATE: GraphViewState = { level: 'package', blast: false };

const PARAM = { level: 'level', scope: 'scope', node: 'node', blast: 'blast' } as const;

export function parseGraphViewState(params: URLSearchParams): GraphViewState {
  const parsedLevel = MapLevelSchema.safeParse(params.get(PARAM.level));
  const level: MapLevel = parsedLevel.success ? parsedLevel.data : 'package';
  const scope = nonEmpty(params.get(PARAM.scope));
  const node = nonEmpty(params.get(PARAM.node));
  const blast = params.get(PARAM.blast) === '1';

  // The symbol level is unbounded without a scope (the API rejects it), so an
  // unscoped symbol level is not a valid view — fall back to the package root.
  if (level === 'symbol' && scope === undefined) {
    return { level: 'package', blast };
  }

  return {
    level,
    ...(scope !== undefined ? { scope } : {}),
    ...(node !== undefined ? { node } : {}),
    blast,
  };
}

export function graphViewStateToParams(state: GraphViewState): URLSearchParams {
  const params = new URLSearchParams();
  // Omit the package default so the canonical map URL stays clean (`/graph`).
  if (state.level !== 'package') {
    params.set(PARAM.level, state.level);
  }
  if (state.scope !== undefined) {
    params.set(PARAM.scope, state.scope);
  }
  if (state.node !== undefined) {
    params.set(PARAM.node, state.node);
  }
  if (state.blast) {
    params.set(PARAM.blast, '1');
  }
  return params;
}

function nonEmpty(value: string | null): string | undefined {
  return value !== null && value.length > 0 ? value : undefined;
}
