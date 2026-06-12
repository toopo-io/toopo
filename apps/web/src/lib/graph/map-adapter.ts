/**
 * Pure adapter: a Serve V1 `MapView` (ADR-0020 §5) → the node/edge arrays React
 * Flow renders. Two rules carry the product's principles:
 *
 *  - TRUST IS NEVER MERGED (ADR-0015 §8). A `MapEdge` projects a trust-split
 *    count `{ deterministic, inferred }` between two containers. We emit it as up
 *    to TWO edges — a solid one for the deterministic count, a dashed one for the
 *    inferred count — and never a single blended "mixed" edge. An edge is omitted
 *    when its count is zero.
 *  - POSITIONS ARE NOT OURS YET. Layout is a derived view (ADR-0015 §3) computed
 *    by ELK downstream; every node starts at the origin and is positioned later.
 *
 * No React Flow runtime is imported — only its types — so this stays pure and
 * unit-testable without a DOM.
 */
import type { MapEdge, MapView } from '@toopo/api-contracts';
import type { Node as GraphNode } from '@toopo/core';
import type { Edge, Node } from '@xyflow/react';
import { nodeLabel } from './node-label';
import type { EdgePoint } from './orthogonal-edge-path';
import type { TrustKind } from './trust';

export interface MapNodeData extends Record<string, unknown> {
  readonly nodeId: string;
  readonly label: string;
  readonly kind: GraphNode['kind'];
  /** The language-namespaced refinement, when present — drives the kind hue. */
  readonly subKind?: string;
  /** How many symbols this container holds — used to size the node (ADR-0020). */
  readonly childCount: number;
  /**
   * Set during a blast-radius overlay on an impacted dependent: the trust of the
   * path that reaches it (ADR-0021) — `deterministic` (certainly impacted, solid
   * outline) or `inferred` (possibly impacted, dashed outline). Absent when this
   * node is not an impacted dependent.
   */
  readonly impact?: TrustKind;
  /** Set during a blast-radius overlay: this node is outside the impact set. */
  readonly dimmed?: boolean;
}

export interface MapEdgeData extends Record<string, unknown> {
  readonly trustKind: TrustKind;
  /** The projected count of underlying edges of this trust kind. */
  readonly count: number;
  /** The ELK-computed orthogonal route, threaded in after layout (graph-explorer). */
  readonly points?: readonly EdgePoint[];
  /** Faded when a focus neighbourhood or the isolate-inferred filter excludes it. */
  readonly dimmed?: boolean;
}

export type MapFlowNode = Node<MapNodeData>;
export type MapFlowEdge = Edge<MapEdgeData>;

export const MAP_NODE_TYPE = 'mapContainer';
export const MAP_EDGE_TYPE = 'trustEdge';

/** Fixed render size of a container node, shared by the card and ELK layout. */
export const MAP_NODE_SIZE = { width: 232, height: 68 } as const;

export function mapViewToFlowNodes(view: MapView): MapFlowNode[] {
  return view.nodes.map((mapNode) => ({
    id: mapNode.node.id,
    type: MAP_NODE_TYPE,
    position: { x: 0, y: 0 },
    // Container nodes are a fixed size (the dimensions fed to ELK), so declare
    // them up front: React Flow then knows every node's extent without waiting on
    // a measure pass, which keeps `useNodesInitialized` and fit-to-view reliable.
    width: MAP_NODE_SIZE.width,
    height: MAP_NODE_SIZE.height,
    data: {
      nodeId: mapNode.node.id,
      label: nodeLabel(mapNode.node),
      kind: mapNode.node.kind,
      ...(mapNode.node.subKind !== undefined ? { subKind: mapNode.node.subKind } : {}),
      childCount: mapNode.childCount,
    },
  }));
}

export function mapViewToFlowEdges(view: MapView): MapFlowEdge[] {
  const edges: MapFlowEdge[] = [];
  for (const edge of view.edges) {
    if (edge.deterministic > 0) {
      edges.push(makeEdge(edge, 'deterministic', edge.deterministic));
    }
    if (edge.inferred > 0) {
      edges.push(makeEdge(edge, 'inferred', edge.inferred));
    }
  }
  return edges;
}

function makeEdge(edge: MapEdge, trustKind: TrustKind, count: number): MapFlowEdge {
  return {
    id: `${edge.sourceId}__${edge.targetId}__${trustKind}`,
    source: edge.sourceId,
    target: edge.targetId,
    type: MAP_EDGE_TYPE,
    data: { trustKind, count },
  };
}
