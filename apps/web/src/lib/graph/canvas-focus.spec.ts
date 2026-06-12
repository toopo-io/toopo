import { describe, expect, it } from 'vitest';
import { edgeTouchesFocus, focusNeighbourhood } from './canvas-focus';
import type { MapFlowEdge } from './map-adapter';

function edge(source: string, target: string): MapFlowEdge {
  return {
    id: `${source}__${target}`,
    source,
    target,
    type: 'trustEdge',
    data: { trustKind: 'deterministic', count: 1 },
  };
}

const EDGES: MapFlowEdge[] = [edge('a', 'b'), edge('a', 'c'), edge('d', 'a'), edge('b', 'c')];

describe('focusNeighbourhood', () => {
  it('includes the focus node itself even with no edges', () => {
    expect([...focusNeighbourhood('lonely', [])]).toEqual(['lonely']);
  });

  it('collects direct neighbours in both directions', () => {
    const set = focusNeighbourhood('a', EDGES);
    expect(set.has('a')).toBe(true); // self
    expect(set.has('b')).toBe(true); // outgoing
    expect(set.has('c')).toBe(true); // outgoing
    expect(set.has('d')).toBe(true); // incoming
  });

  it('excludes nodes more than one hop away', () => {
    // From 'd' only 'a' is one hop; 'b'/'c' are two hops and must not appear.
    const set = focusNeighbourhood('d', EDGES);
    expect([...set].sort()).toEqual(['a', 'd']);
  });
});

describe('edgeTouchesFocus', () => {
  it('is true when the focus is either endpoint', () => {
    expect(edgeTouchesFocus(edge('a', 'b'), 'a')).toBe(true);
    expect(edgeTouchesFocus(edge('a', 'b'), 'b')).toBe(true);
  });

  it('is false when the focus is neither endpoint', () => {
    expect(edgeTouchesFocus(edge('a', 'b'), 'c')).toBe(false);
  });
});
