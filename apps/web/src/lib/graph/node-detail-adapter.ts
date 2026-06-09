/**
 * Pure adapter: a Serve V2 `NodeDetail` (ADR-0020 §5) → a flat view-model the
 * detail panel renders (built in a later slice). It surfaces trust on EVERY
 * relationship (ADR-0015 §8): each neighbour and each passed argument carries its
 * `trustKind` (+ `confidence` for inferred), so the panel can mark every row
 * solid/dashed exactly like the map. The far node of a neighbour may be `null`
 * (an external/unresolved id, ADR-0015 §11) — represented honestly as a missing
 * label, never invented.
 */
import type { NodeDetail } from '@toopo/api-contracts';
import type { Confidence, Edge, EdgeKind, Node } from '@toopo/core';
import { nodeLabel } from './node-label';
import type { TrustKind } from './trust';

/**
 * The edge kinds that are DEPENDENCIES (who calls/uses whom), as opposed to
 * structure (`contains`/`exports`). Callers/callees show only these — the same
 * definition the map projection and blast radius use — so the panel does not
 * echo a symbol's own params/call-sites (which have their own sections) as
 * "callees".
 */
const DEPENDENCY_EDGE_KINDS: ReadonlySet<EdgeKind> = new Set([
  'imports',
  'references',
  'calls',
  'extends',
  'implements',
]);

export interface InterfaceRow {
  readonly id: string;
  readonly label: string;
  readonly subKind?: string;
}

export interface NeighborRow {
  readonly edgeKind: EdgeKind;
  readonly trustKind: TrustKind;
  readonly confidence?: Confidence;
  /** The far-end node id (the caller for incoming, the callee for outgoing). */
  readonly nodeId: string;
  /** The far node's label, or `null` when the id is external/unresolved. */
  readonly label: string | null;
}

export interface PayloadArgRow {
  readonly ordinal: number;
  readonly name?: string;
  readonly passKind: 'positional' | 'named' | 'spread';
  readonly value?: string;
  readonly trustKind: TrustKind;
  readonly confidence?: Confidence;
}

export interface CallSiteRow {
  readonly id: string;
  readonly callee: string;
  readonly args: readonly PayloadArgRow[];
}

export interface NodeDetailViewModel {
  readonly id: string;
  readonly label: string;
  readonly kind: Node['kind'];
  readonly subKind?: string;
  readonly analysisStatus?: string;
  readonly declaredInterface: readonly InterfaceRow[];
  readonly callers: readonly NeighborRow[];
  readonly callees: readonly NeighborRow[];
  readonly callSites: readonly CallSiteRow[];
}

export function nodeDetailToViewModel(detail: NodeDetail): NodeDetailViewModel {
  const { node } = detail;
  return {
    id: node.id,
    label: nodeLabel(node),
    kind: node.kind,
    ...(node.subKind !== undefined ? { subKind: node.subKind } : {}),
    ...(node.analysis !== undefined ? { analysisStatus: node.analysis.status } : {}),
    declaredInterface: detail.declaredInterface.items.map(toInterfaceRow),
    callers: detail.incoming.items
      .filter((neighbor) => DEPENDENCY_EDGE_KINDS.has(neighbor.edge.kind))
      .map((neighbor) => toNeighborRow(neighbor, 'in')),
    callees: detail.outgoing.items
      .filter((neighbor) => DEPENDENCY_EDGE_KINDS.has(neighbor.edge.kind))
      .map((neighbor) => toNeighborRow(neighbor, 'out')),
    callSites: detail.callSites.items.map(toCallSiteRow),
  };
}

function toInterfaceRow(node: Node): InterfaceRow {
  return {
    id: node.id,
    label: nodeLabel(node),
    ...(node.subKind !== undefined ? { subKind: node.subKind } : {}),
  };
}

function toNeighborRow(
  neighbor: { readonly edge: Edge; readonly node: Node | null },
  direction: 'in' | 'out',
): NeighborRow {
  const { edge, node } = neighbor;
  const farId = direction === 'in' ? edge.sourceId : edge.targetId;
  return {
    edgeKind: edge.kind,
    nodeId: farId,
    label: node !== null ? nodeLabel(node) : null,
    ...trustOf(edge),
  };
}

function toCallSiteRow(node: Node): CallSiteRow {
  if (node.kind !== 'callSite') {
    // The call-sites list always holds call-site nodes; degrade honestly rather
    // than fabricate payload data if the contract ever surprises us.
    return { id: node.id, callee: nodeLabel(node), args: [] };
  }
  return {
    id: node.id,
    callee: node.callee,
    args: node.payload.map((arg) => ({
      ordinal: arg.ordinal,
      ...(arg.name !== undefined ? { name: arg.name } : {}),
      passKind: arg.passKind,
      ...(arg.value !== undefined ? { value: arg.value } : {}),
      ...trustOf(arg),
    })),
  };
}

/** Extract the §8 trust discriminator from any resolution-tagged fact. */
function trustOf(
  fact: { resolution: 'deterministic' } | { resolution: 'inferred'; confidence: Confidence },
): {
  trustKind: TrustKind;
  confidence?: Confidence;
} {
  return fact.resolution === 'inferred'
    ? { trustKind: 'inferred', confidence: fact.confidence }
    : { trustKind: 'deterministic' };
}
