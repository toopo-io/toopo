import { describe, expect, it } from 'vitest';
import { TRUST_DASHARRAY, TRUST_EDGE_OFFSET, trustEdgeStyle } from './trust';

describe('trust visual language (ADR-0015 §8)', () => {
  it('deterministic is solid (no dash), inferred is dashed', () => {
    expect(TRUST_DASHARRAY.deterministic).toBeUndefined();
    expect(TRUST_DASHARRAY.inferred).toBeDefined();
  });

  it('aggregated parallel edges bow to opposite sides by an equal fixed amount', () => {
    expect(Math.sign(TRUST_EDGE_OFFSET.deterministic)).toBe(1);
    expect(Math.sign(TRUST_EDGE_OFFSET.inferred)).toBe(-1);
    expect(TRUST_EDGE_OFFSET.deterministic).toBe(-TRUST_EDGE_OFFSET.inferred);
    // A meaningful, non-trivial separation so the two edges never read as one.
    expect(Math.abs(TRUST_EDGE_OFFSET.deterministic)).toBeGreaterThanOrEqual(12);
  });

  it('deterministic edge style is solid and fully opaque, with no dasharray', () => {
    const style = trustEdgeStyle('deterministic');
    expect(style.strokeDasharray).toBeUndefined();
    expect(style.opacity).toBe(1);
    expect(style.stroke).toContain('deterministic');
  });

  it('inferred edge style is dashed and uses the inferred colour', () => {
    const style = trustEdgeStyle('inferred');
    expect(style.strokeDasharray).toBeDefined();
    expect(style.stroke).toContain('inferred');
  });

  it('confidence fades inferred edges (low fainter than high), deterministic ignores it', () => {
    expect(trustEdgeStyle('inferred', 'high').opacity).toBe(1);
    expect(trustEdgeStyle('inferred', 'medium').opacity).toBe(0.8);
    expect(trustEdgeStyle('inferred', 'low').opacity).toBe(0.6);
    // Deterministic carries no confidence (§8) — it stays fully opaque regardless.
    expect(trustEdgeStyle('deterministic', 'low').opacity).toBe(1);
  });
});
