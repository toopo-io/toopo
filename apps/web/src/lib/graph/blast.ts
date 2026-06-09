/**
 * Pure adapter for the V4 blast-radius view (ADR-0020): the bounded set of nodes
 * that (transitively) depend on the selected node, with each hit's shortest
 * depth. Rows are ordered by depth then label so the nearest dependents read
 * first. An unresolved far node shows no label rather than an invented one.
 *
 * Per-hit trust (ADR-0021, ADR-0015 §8): each row carries `pathResolution` —
 * `deterministic` iff a fully-deterministic reverse-dependency chain proves the
 * impact (certainly impacted), `inferred` iff every path traverses an inferred
 * edge (possibly impacted). The value is exactly a {@link TrustKind}, so the UI
 * renders it with the same solid/dashed language as every other trust signal.
 * This supersedes the old panel-level caveat with a real per-node distinction.
 */
import type { BlastRadiusPage } from '@toopo/api-contracts';
import { nodeLabel } from './node-label';
import type { TrustKind } from './trust';

export interface BlastRow {
  readonly nodeId: string;
  readonly depth: number;
  readonly label: string | null;
  /** Trust of the path that reaches this dependent (ADR-0021): solid vs dashed. */
  readonly pathResolution: TrustKind;
}

export function blastRows(page: BlastRadiusPage): BlastRow[] {
  return page.items
    .map((item) => ({
      nodeId: item.nodeId,
      depth: item.depth,
      label: item.node !== null ? nodeLabel(item.node) : null,
      pathResolution: item.pathResolution,
    }))
    .sort((a, b) => a.depth - b.depth || (a.label ?? a.nodeId).localeCompare(b.label ?? b.nodeId));
}
