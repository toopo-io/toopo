/**
 * Deterministic graph layout via ELK (ADR-0020 Fork 2 ruling). Layout is a
 * DERIVED view (ADR-0015 §3): positions are computed per render, never stored.
 * We use ELK's `layered` (Sugiyama) algorithm — the readable, direction-bearing
 * layout for a dependency DAG, and the only mainstream engine with first-class
 * nested/containment layout for the deeper zoom tiers built in later slices.
 *
 * Edges are routed ORTHOGONALLY and their computed routes are returned alongside
 * the node positions: ELK knows where every wire bends to avoid the boxes, so we
 * draw the real route instead of a naive straight/curved guess between handles.
 *
 * Layout is kept DETERMINISTIC (a pinned seed, a stable algorithm) so the same
 * graph yields the same picture — consistent with the determinism cardinal
 * principle. The function is decoupled from React Flow types (plain `{id,w,h}` in,
 * positions + routes out) so it is unit-testable without a DOM, and it degrades
 * gracefully: an edge referencing a missing node is dropped, never thrown
 * (a cartography view must never crash on a partial graph).
 */
import type { ElkNode } from 'elkjs';
import ELK from 'elkjs/lib/elk.bundled.js';

export interface LayoutInputNode {
  readonly id: string;
  readonly width: number;
  readonly height: number;
}

export interface LayoutInputEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
}

export interface LayoutPosition {
  readonly x: number;
  readonly y: number;
}

/** An ordered polyline (start → bend points → end) in the layout coordinate space. */
export type EdgeRoute = readonly LayoutPosition[];

export interface GraphLayout {
  /** Top-left position per node id, in layout space (= React Flow flow space). */
  readonly positions: ReadonlyMap<string, LayoutPosition>;
  /** Orthogonal route per edge id; absent for an edge ELK did not route. */
  readonly edgeRoutes: ReadonlyMap<string, EdgeRoute>;
}

/** Left-to-right layered layout, orthogonal edges, generously spaced; pinned. */
export const ELK_LAYOUT_OPTIONS: Readonly<Record<string, string>> = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.layered.spacing.nodeNodeBetweenLayers': '120',
  'elk.spacing.nodeNode': '48',
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  'elk.randomSeed': '1',
};

const elk = new ELK();

export async function layoutGraph(
  nodes: readonly LayoutInputNode[],
  edges: readonly LayoutInputEdge[],
): Promise<GraphLayout> {
  const positions = new Map<string, LayoutPosition>();
  const edgeRoutes = new Map<string, EdgeRoute>();
  if (nodes.length === 0) {
    return { positions, edgeRoutes };
  }

  const present = new Set(nodes.map((node) => node.id));
  const graph: ElkNode = {
    id: 'root',
    layoutOptions: { ...ELK_LAYOUT_OPTIONS },
    children: nodes.map((node) => ({ id: node.id, width: node.width, height: node.height })),
    edges: edges
      .filter((edge) => present.has(edge.source) && present.has(edge.target))
      .map((edge) => ({ id: edge.id, sources: [edge.source], targets: [edge.target] })),
  };

  const laidOut = await elk.layout(graph);
  for (const child of laidOut.children ?? []) {
    positions.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 });
  }
  for (const edge of laidOut.edges ?? []) {
    const route = sectionRoute(edge);
    if (route !== null) {
      edgeRoutes.set(edge.id, route);
    }
  }
  return { positions, edgeRoutes };
}

/** The first section's start → bend → end points, or null when ELK routed none. */
function sectionRoute(edge: { sections?: readonly ElkEdgeSection[] }): EdgeRoute | null {
  const section = edge.sections?.[0];
  if (section === undefined) {
    return null;
  }
  return [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map((point) => ({
    x: point.x,
    y: point.y,
  }));
}

interface ElkPoint {
  readonly x: number;
  readonly y: number;
}
interface ElkEdgeSection {
  readonly startPoint: ElkPoint;
  readonly endPoint: ElkPoint;
  readonly bendPoints?: readonly ElkPoint[];
}
