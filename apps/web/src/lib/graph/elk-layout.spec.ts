import { describe, expect, it } from 'vitest';
import { type LayoutInputNode, layoutGraph } from './elk-layout';

const NODES: LayoutInputNode[] = [
  { id: 'a', width: 180, height: 56 },
  { id: 'b', width: 180, height: 56 },
  { id: 'c', width: 180, height: 56 },
];
const EDGES = [
  { id: 'a->b', source: 'a', target: 'b' },
  { id: 'b->c', source: 'b', target: 'c' },
];

describe('layoutGraph (ELK)', () => {
  it('returns empty positions and routes for an empty graph', async () => {
    const layout = await layoutGraph([], []);
    expect(layout.positions.size).toBe(0);
    expect(layout.edgeRoutes.size).toBe(0);
  });

  it('assigns a finite position to every node', async () => {
    const { positions } = await layoutGraph(NODES, EDGES);
    expect(positions.size).toBe(3);
    for (const id of ['a', 'b', 'c']) {
      const pos = positions.get(id);
      expect(Number.isFinite(pos?.x)).toBe(true);
      expect(Number.isFinite(pos?.y)).toBe(true);
    }
  });

  it('lays a dependency chain out left-to-right (a before b before c)', async () => {
    const { positions } = await layoutGraph(NODES, EDGES);
    const ax = positions.get('a')?.x ?? 0;
    const bx = positions.get('b')?.x ?? 0;
    const cx = positions.get('c')?.x ?? 0;
    expect(ax).toBeLessThan(bx);
    expect(bx).toBeLessThan(cx);
  });

  it('returns an orthogonal route per edge (start, optional bends, end)', async () => {
    const { edgeRoutes } = await layoutGraph(NODES, EDGES);
    for (const id of ['a->b', 'b->c']) {
      const route = edgeRoutes.get(id);
      expect(route).toBeDefined();
      expect((route?.length ?? 0) >= 2).toBe(true);
      for (const point of route ?? []) {
        expect(Number.isFinite(point.x)).toBe(true);
        expect(Number.isFinite(point.y)).toBe(true);
      }
    }
  });

  it('routes a left-to-right edge from a lower to a higher x', async () => {
    const { edgeRoutes } = await layoutGraph(NODES, EDGES);
    const route = edgeRoutes.get('a->b');
    const first = route?.[0];
    const last = route?.[route.length - 1];
    expect((first?.x ?? 0) < (last?.x ?? 0)).toBe(true);
  });

  it('is deterministic — the same graph yields the same layout and routes', async () => {
    const first = await layoutGraph(NODES, EDGES);
    const second = await layoutGraph(NODES, EDGES);
    expect([...first.positions.entries()]).toEqual([...second.positions.entries()]);
    expect([...first.edgeRoutes.entries()]).toEqual([...second.edgeRoutes.entries()]);
  });

  it('drops an edge that references a missing node instead of throwing', async () => {
    const { positions, edgeRoutes } = await layoutGraph(NODES, [
      { id: 'x', source: 'a', target: 'ghost' },
    ]);
    expect(positions.size).toBe(3);
    expect(edgeRoutes.has('x')).toBe(false);
  });

  it('spreads disconnected nodes (zero edges) into distinct positions', async () => {
    const isolated: LayoutInputNode[] = Array.from({ length: 6 }, (_, i) => ({
      id: `n${i}`,
      width: 180,
      height: 56,
    }));
    const { positions, edgeRoutes } = await layoutGraph(isolated, []);
    expect(positions.size).toBe(6);
    expect(edgeRoutes.size).toBe(0);
    // None are stacked on top of another at the origin — every node is placed.
    const coords = [...positions.values()].map((point) => `${point.x},${point.y}`);
    expect(new Set(coords).size).toBe(6);
    for (const point of positions.values()) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
    }
  });
});
