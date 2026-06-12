/**
 * Pure focus-neighbourhood logic for the cartography canvas. Hovering or
 * selecting a node focuses it: the node plus everything one dependency hop away
 * stays lit, the rest fades — so a dense map reads as "what touches this" without
 * a re-layout. Kept free of React Flow runtime (types only) so it is testable
 * without a DOM. This is the everyday counterpart to the blast-radius overlay
 * (ADR-0021), which is a deeper, trust-aware traversal rather than one hop.
 */
import type { MapFlowEdge } from './map-adapter';

/** The focus node and its direct neighbours (incoming and outgoing). */
export function focusNeighbourhood(
  focusId: string,
  edges: readonly MapFlowEdge[],
): ReadonlySet<string> {
  const neighbourhood = new Set<string>([focusId]);
  for (const edge of edges) {
    if (edge.source === focusId) {
      neighbourhood.add(edge.target);
    } else if (edge.target === focusId) {
      neighbourhood.add(edge.source);
    }
  }
  return neighbourhood;
}

/** Whether an edge touches the focus node (so it stays lit while neighbours dim). */
export function edgeTouchesFocus(edge: MapFlowEdge, focusId: string): boolean {
  return edge.source === focusId || edge.target === focusId;
}
