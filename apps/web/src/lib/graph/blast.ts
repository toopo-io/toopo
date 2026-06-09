/**
 * Pure adapter for the V4 blast-radius view (ADR-0020): the bounded set of nodes
 * that (transitively) depend on the selected node, with each hit's shortest
 * depth. Rows are ordered by depth then label so the nearest dependents read
 * first. An unresolved far node shows no label rather than an invented one.
 *
 * Trust note (ADR-0015 §8, Fork 6 option A): reverse-reachability collapses the
 * paths, so the current contract carries NO per-hit trust — the UI must NOT claim
 * which dependents are certainly vs possibly impacted. The honest framing ("may
 * include inferred links") lives in the panel label; the committed follow-up
 * (Fork 6B: per-hit `pathResolution`) will let each row carry its own trust.
 */
import type { BlastRadiusPage } from '@toopo/api-contracts';
import { nodeLabel } from './node-label';

export interface BlastRow {
  readonly nodeId: string;
  readonly depth: number;
  readonly label: string | null;
}

export function blastRows(page: BlastRadiusPage): BlastRow[] {
  return page.items
    .map((item) => ({
      nodeId: item.nodeId,
      depth: item.depth,
      label: item.node !== null ? nodeLabel(item.node) : null,
    }))
    .sort((a, b) => a.depth - b.depth || (a.label ?? a.nodeId).localeCompare(b.label ?? b.nodeId));
}
