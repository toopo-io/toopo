import { describe, expect, it } from 'vitest';
import { type EdgePoint, orthogonalEdgePath } from './orthogonal-edge-path';

describe('orthogonalEdgePath', () => {
  it('returns null for a route with fewer than two points', () => {
    expect(orthogonalEdgePath([])).toBeNull();
    expect(orthogonalEdgePath([{ x: 1, y: 2 }])).toBeNull();
  });

  it('emits a move-then-line path through every point', () => {
    const points: EdgePoint[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 20 },
    ];
    const geometry = orthogonalEdgePath(points);
    expect(geometry?.path).toBe('M0,0 L10,0 L10,20');
  });

  it('anchors the label at the arc-length midpoint of the polyline', () => {
    // Total length 40 (20 + 20); the midpoint sits at the first bend (20 in).
    const geometry = orthogonalEdgePath([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 },
    ]);
    expect(geometry?.labelX).toBeCloseTo(20);
    expect(geometry?.labelY).toBeCloseTo(0);
  });

  it('rounds coordinates to two decimals for a compact deterministic path', () => {
    const geometry = orthogonalEdgePath([
      { x: 0.126, y: 1.234 },
      { x: 2.5, y: 2.5 },
    ]);
    expect(geometry?.path).toBe('M0.13,1.23 L2.5,2.5');
  });
});
