/**
 * ADR-0029 D7 — the iterative-Tarjan cycle grouping. Pure unit tests over the
 * `findCycles` function: SCC detection, self-loops, the trust rule (any inferred
 * internal edge → candidate), non-cycle exclusion, and deterministic output.
 */
import type { DependencyEdge } from '@toopo/db';
import { describe, expect, it } from 'vitest';
import { findCycles } from './cycles.js';

const edge = (sourceId: string, targetId: string, inferred = false): DependencyEdge => ({
  key: `${sourceId}->${targetId}`,
  sourceId,
  targetId,
  resolution: inferred ? 'inferred' : 'deterministic',
});

describe('findCycles', () => {
  it('detects a two-node cycle, certain when every internal edge is proven', () => {
    const cycles = findCycles([edge('A', 'B'), edge('B', 'A')]);
    expect(cycles).toHaveLength(1);
    expect(cycles[0]).toMatchObject({ id: 'A', members: ['A', 'B'], length: 2, candidate: false });
  });

  it('marks a cycle a candidate when any internal edge is inferred', () => {
    const cycles = findCycles([edge('A', 'B'), edge('B', 'A', true)]);
    expect(cycles[0]?.candidate).toBe(true);
  });

  it('detects direct recursion (a self-loop) as a one-node cycle', () => {
    const cycles = findCycles([edge('R', 'R')]);
    expect(cycles).toHaveLength(1);
    expect(cycles[0]).toMatchObject({ id: 'R', members: ['R'], length: 1 });
  });

  it('excludes a plain chain (no strongly-connected component of size > 1)', () => {
    expect(findCycles([edge('A', 'B'), edge('B', 'C')])).toEqual([]);
  });

  it('groups a larger SCC and separates an unrelated cycle', () => {
    // A→B→C→A is one SCC; X→Y→X another; the chain D→A is not in either.
    const cycles = findCycles([
      edge('A', 'B'),
      edge('B', 'C'),
      edge('C', 'A'),
      edge('X', 'Y'),
      edge('Y', 'X'),
      edge('D', 'A'),
    ]);
    expect(cycles.map((c) => c.id)).toEqual(['A', 'X']);
    expect(cycles[0]?.members).toEqual(['A', 'B', 'C']);
    expect(cycles[1]?.members).toEqual(['X', 'Y']);
  });

  it('is deterministic regardless of edge order', () => {
    const a = findCycles([edge('A', 'B'), edge('B', 'A'), edge('C', 'D'), edge('D', 'C')]);
    const b = findCycles([edge('D', 'C'), edge('B', 'A'), edge('C', 'D'), edge('A', 'B')]);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
});
