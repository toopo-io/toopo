import { describe, expect, it } from 'vitest';
import type { Edge } from '../edges/edge';
import type { Node } from '../nodes/node';
import { compareEdges, compareNodes, compareSymbolIds, sortEdges, sortNodes } from './compare';

function symbol(id: string): Node {
  return { kind: 'symbol', id, name: id, properties: {} };
}

function edge(sourceId: string, targetId: string, kind: Edge['kind']): Edge {
  return {
    kind,
    sourceId,
    targetId,
    resolution: 'deterministic',
    provenance: { pass: 'resolve', rule: 'test' },
  };
}

describe('compareSymbolIds', () => {
  it('orders lexicographically and is total', () => {
    expect(compareSymbolIds('a', 'b')).toBe(-1);
    expect(compareSymbolIds('b', 'a')).toBe(1);
    expect(compareSymbolIds('a', 'a')).toBe(0);
  });
});

describe('sortNodes', () => {
  it('returns a new array in canonical id order without mutating the input', () => {
    const input = [symbol('c'), symbol('a'), symbol('b')];
    const sorted = sortNodes(input);
    expect(sorted.map((n) => n.id)).toEqual(['a', 'b', 'c']);
    expect(input.map((n) => n.id)).toEqual(['c', 'a', 'b']);
  });

  it('is deterministic across shuffles', () => {
    const a = sortNodes([symbol('x'), symbol('a'), symbol('m')]);
    const b = sortNodes([symbol('m'), symbol('x'), symbol('a')]);
    expect(a.map((n) => n.id)).toEqual(b.map((n) => n.id));
  });
});

describe('sortEdges', () => {
  it('orders by source, then kind, then target, without mutating the input', () => {
    const input = [edge('b', 'a', 'calls'), edge('a', 'z', 'imports'), edge('a', 'c', 'calls')];
    const sorted = sortEdges(input);
    expect(sorted.map((e) => `${e.sourceId}-${e.kind}-${e.targetId}`)).toEqual([
      'a-calls-c',
      'a-imports-z',
      'b-calls-a',
    ]);
    expect(input).toHaveLength(3);
  });
});

describe('compareNodes / compareEdges', () => {
  it('return 0 for equivalent keys', () => {
    expect(compareNodes(symbol('a'), symbol('a'))).toBe(0);
    expect(compareEdges(edge('a', 'b', 'calls'), edge('a', 'b', 'calls'))).toBe(0);
  });

  it('tie-breaks edges by subKind, sorting an absent subKind last', () => {
    const withSubKind: Edge = { ...edge('a', 'b', 'calls'), subKind: 'ts:call' };
    const withoutSubKind = edge('a', 'b', 'calls');
    expect(compareEdges(withSubKind, withoutSubKind)).toBe(-1);
    expect(compareEdges(withoutSubKind, withSubKind)).toBe(1);
    const lower: Edge = { ...edge('a', 'b', 'calls'), subKind: 'ts:a' };
    const higher: Edge = { ...edge('a', 'b', 'calls'), subKind: 'ts:b' };
    expect(compareEdges(lower, higher)).toBe(-1);
  });

  it('tie-breaks edges by resolution as the final key', () => {
    const deterministic = edge('a', 'b', 'calls');
    const inferred: Edge = {
      kind: 'calls',
      sourceId: 'a',
      targetId: 'b',
      resolution: 'inferred',
      confidence: 'high',
      provenance: { pass: 'resolve', rule: 'test' },
    };
    expect(compareEdges(deterministic, inferred)).toBe(-1);
    expect(compareEdges(inferred, deterministic)).toBe(1);
  });
});
