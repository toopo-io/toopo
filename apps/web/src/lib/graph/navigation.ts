/**
 * Pure navigation logic for the cartography drill-down (ADR-0020 V1 zoom):
 * package → file → symbol. Clicking a container descends one containment level
 * scoped to it; a breadcrumb reflects the scope's ancestry and lets the viewer
 * climb back. All of it is a pure function of the URL state (`level` + `scope`)
 * plus resolved labels, so it is deep-linkable and unit-testable.
 */
import type { MapLevel } from '@toopo/api-contracts';
import type { GraphViewState } from './view-state';

/**
 * The view to descend to when a container node is clicked, or `null` at the
 * deepest map level (symbol) where a click opens the detail panel instead.
 *   - package → the file map scoped to that package,
 *   - file    → the symbol map scoped to that file.
 */
export function drillTarget(
  level: MapLevel,
  nodeId: string,
): { level: MapLevel; scope: string } | null {
  if (level === 'package') {
    return { level: 'file', scope: nodeId };
  }
  if (level === 'file') {
    return { level: 'symbol', scope: nodeId };
  }
  return null;
}

export interface Crumb {
  readonly label: string;
  /** The view this crumb navigates to when clicked. */
  readonly target: GraphViewState;
  readonly isCurrent: boolean;
}

export interface ScopeTrailInput {
  readonly level: MapLevel;
  readonly scope?: string;
  /** Label of the root crumb (the entry tier — usually "Packages"). */
  readonly rootLabel: string;
  /** Display label of the current scope node (e.g. a file's basename). */
  readonly scopeLabel?: string;
  /** The package that contains the scope, when the scope is a file (symbol level). */
  readonly packageAncestor?: { readonly id: string; readonly label: string };
}

const ROOT_TARGET: GraphViewState = { level: 'package', blast: false };

/**
 * The breadcrumb trail from the root tier down to the current scope. Labels for
 * deeper crumbs are resolved by the caller (the scope's own label and, at symbol
 * level, its containing package); when unresolved the raw id is shown rather than
 * inventing a name.
 */
export function buildScopeTrail(input: ScopeTrailInput): Crumb[] {
  const root: Crumb = {
    label: input.rootLabel,
    target: ROOT_TARGET,
    isCurrent: input.scope === undefined,
  };
  if (input.scope === undefined) {
    return [root];
  }

  const trail: Crumb[] = [root];
  if (input.level === 'file') {
    trail.push({
      label: input.scopeLabel ?? input.scope,
      target: { level: 'file', scope: input.scope, blast: false },
      isCurrent: true,
    });
    return trail;
  }
  // Symbol level: the scope is a file; show its package above it when known.
  if (input.packageAncestor !== undefined) {
    trail.push({
      label: input.packageAncestor.label,
      target: { level: 'file', scope: input.packageAncestor.id, blast: false },
      isCurrent: false,
    });
  }
  trail.push({
    label: input.scopeLabel ?? input.scope,
    target: { level: 'symbol', scope: input.scope, blast: false },
    isCurrent: true,
  });
  return trail;
}
