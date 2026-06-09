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
  it('returns an empty map for an empty graph', async () => {
    expect((await layoutGraph([], [])).size).toBe(0);
  });

  it('assigns a finite position to every node', async () => {
    const positions = await layoutGraph(NODES, EDGES);
    expect(positions.size).toBe(3);
    for (const id of ['a', 'b', 'c']) {
      const pos = positions.get(id);
      expect(Number.isFinite(pos?.x)).toBe(true);
      expect(Number.isFinite(pos?.y)).toBe(true);
    }
  });

  it('lays a dependency chain out left-to-right (a before b before c)', async () => {
    const positions = await layoutGraph(NODES, EDGES);
    const ax = positions.get('a')?.x ?? 0;
    const bx = positions.get('b')?.x ?? 0;
    const cx = positions.get('c')?.x ?? 0;
    expect(ax).toBeLessThan(bx);
    expect(bx).toBeLessThan(cx);
  });

  it('is deterministic — the same graph yields the same layout', async () => {
    const first = await layoutGraph(NODES, EDGES);
    const second = await layoutGraph(NODES, EDGES);
    expect([...first.entries()]).toEqual([...second.entries()]);
  });

  it('drops an edge that references a missing node instead of throwing', async () => {
    const positions = await layoutGraph(NODES, [{ id: 'x', source: 'a', target: 'ghost' }]);
    expect(positions.size).toBe(3);
  });
});
