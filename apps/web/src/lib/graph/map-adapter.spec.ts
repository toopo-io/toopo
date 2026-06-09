import type { MapView } from '@toopo/api-contracts';
import { describe, expect, it } from 'vitest';
import {
  MAP_EDGE_TYPE,
  MAP_NODE_TYPE,
  mapViewToFlowEdges,
  mapViewToFlowNodes,
} from './map-adapter';

function packageNode(id: string, name: string, childCount: number) {
  return { node: { kind: 'package' as const, id, name, properties: {} }, childCount };
}

const VIEW: MapView = {
  level: 'package',
  nodes: [packageNode('pkgA', '@toopo/web', 4), packageNode('pkgB', '@toopo/ui', 1)],
  edges: [
    { sourceId: 'pkgA', targetId: 'pkgB', deterministic: 3, inferred: 2 },
    { sourceId: 'pkgB', targetId: 'pkgA', deterministic: 1, inferred: 0 },
  ],
  truncated: false,
};

describe('mapViewToFlowNodes', () => {
  it('maps each container to a flow node with label, kind and childCount', () => {
    const nodes = mapViewToFlowNodes(VIEW);
    expect(nodes).toHaveLength(2);
    const a = nodes.find((n) => n.id === 'pkgA');
    expect(a?.type).toBe(MAP_NODE_TYPE);
    expect(a?.data.label).toBe('@toopo/web');
    expect(a?.data.kind).toBe('package');
    expect(a?.data.childCount).toBe(4);
  });

  it('starts every node at the origin (ELK positions them later)', () => {
    for (const node of mapViewToFlowNodes(VIEW)) {
      expect(node.position).toEqual({ x: 0, y: 0 });
    }
  });
});

describe('mapViewToFlowEdges (trust never merged, ADR-0015 §8)', () => {
  it('splits a mixed edge into one solid (deterministic) and one dashed (inferred) edge', () => {
    const edges = mapViewToFlowEdges(VIEW);
    const aToB = edges.filter((e) => e.source === 'pkgA' && e.target === 'pkgB');
    expect(aToB).toHaveLength(2);
    const det = aToB.find((e) => e.data?.trustKind === 'deterministic');
    const inf = aToB.find((e) => e.data?.trustKind === 'inferred');
    expect(det?.data?.count).toBe(3);
    expect(inf?.data?.count).toBe(2);
    expect(det?.id).not.toBe(inf?.id);
    expect(det?.type).toBe(MAP_EDGE_TYPE);
  });

  it('omits the inferred edge entirely when the inferred count is zero', () => {
    const edges = mapViewToFlowEdges(VIEW);
    const bToA = edges.filter((e) => e.source === 'pkgB' && e.target === 'pkgA');
    expect(bToA).toHaveLength(1);
    expect(bToA[0]?.data?.trustKind).toBe('deterministic');
  });

  it('produces unique edge ids per (pair, trust kind)', () => {
    const ids = mapViewToFlowEdges(VIEW).map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
