import { describe, expect, it } from 'vitest';
import { parallelEdgePath } from './parallel-edge-path';

describe('parallelEdgePath', () => {
  it('draws a straight line when there is no offset', () => {
    const g = parallelEdgePath({ sourceX: 0, sourceY: 0, targetX: 100, targetY: 0, offset: 0 });
    expect(g.path).toBe('M0,0 L100,0');
    expect(g).toMatchObject({ labelX: 50, labelY: 0 });
  });

  it('bows opposite signs to opposite sides (the apex is the label point)', () => {
    const base = { sourceX: 0, sourceY: 0, targetX: 100, targetY: 0 };
    const solid = parallelEdgePath({ ...base, offset: 18 });
    const dashed = parallelEdgePath({ ...base, offset: -18 });
    // Horizontal edge → apex displaced purely in Y, to opposite sides.
    expect(solid.labelY).toBe(18);
    expect(dashed.labelY).toBe(-18);
    expect(solid.path).not.toBe(dashed.path);
  });

  it('separates by a FIXED apex distance regardless of node distance', () => {
    const near = parallelEdgePath({ sourceX: 0, sourceY: 0, targetX: 30, targetY: 0, offset: 18 });
    const far = parallelEdgePath({ sourceX: 0, sourceY: 0, targetX: 900, targetY: 0, offset: 18 });
    // Both bow the apex the same 18px off-axis — the separation never collapses.
    expect(near.labelY).toBe(18);
    expect(far.labelY).toBe(18);
  });

  it('emits a quadratic curve through a perpendicular control point', () => {
    const g = parallelEdgePath({ sourceX: 0, sourceY: 0, targetX: 0, targetY: 100, offset: 10 });
    // Vertical edge → apex displaced in -X; control at 2*offset.
    expect(g.path).toBe('M0,0 Q-20,50 0,100');
    expect(g.labelX).toBe(-10);
  });
});
