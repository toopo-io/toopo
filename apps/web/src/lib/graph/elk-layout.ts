/**
 * Deterministic graph layout via ELK (ADR-0020 Fork 2 ruling). Layout is a
 * DERIVED view (ADR-0015 §3): positions are computed per render, never stored.
 * We use ELK's `layered` (Sugiyama) algorithm — the readable, direction-bearing
 * layout for a dependency DAG, and the only mainstream engine with first-class
 * nested/containment layout for the deeper zoom tiers built in later slices.
 *
 * Layout is kept DETERMINISTIC (a pinned seed, a stable algorithm) so the same
 * graph yields the same picture — consistent with the determinism cardinal
 * principle. The function is decoupled from React Flow types (plain `{id,w,h}` in,
 * `id → {x,y}` out) so it is unit-testable without a DOM, and it degrades
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

/** Left-to-right layered layout, generously spaced; pinned for determinism. */
export const ELK_LAYOUT_OPTIONS: Readonly<Record<string, string>> = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.layered.spacing.nodeNodeBetweenLayers': '120',
  'elk.spacing.nodeNode': '48',
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  'elk.randomSeed': '1',
};

const elk = new ELK();

export async function layoutGraph(
  nodes: readonly LayoutInputNode[],
  edges: readonly LayoutInputEdge[],
): Promise<Map<string, LayoutPosition>> {
  const positions = new Map<string, LayoutPosition>();
  if (nodes.length === 0) {
    return positions;
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
  return positions;
}
