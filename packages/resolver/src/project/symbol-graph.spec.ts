import type { Edge, Node, SymbolId } from '@toopo/core';
import { describe, expect, it } from 'vitest';
import { buildSymbolGraph } from './symbol-graph.js';

const FILE: SymbolId = 'file.';
const SYMBOL: SymbolId = 'file.Widget.';

function fileNode(id: SymbolId): Node {
  return { kind: 'file', id, path: 'src/widget.tsx', contentHash: 'h', properties: {} };
}
function symbolNode(id: SymbolId, name: string): Node {
  return { kind: 'symbol', id, name, subKind: 'react:component', properties: {} };
}
function containsEdge(sourceId: SymbolId, targetId: SymbolId): Edge {
  return {
    kind: 'contains',
    sourceId,
    targetId,
    provenance: { pass: 'parse', rule: 'react/contains-symbol' },
    resolution: 'deterministic',
  };
}

describe('buildSymbolGraph.fileOf', () => {
  const graph = buildSymbolGraph(
    [fileNode(FILE), symbolNode(SYMBOL, 'Widget')],
    [containsEdge(FILE, SYMBOL)],
  );

  it('maps a symbol to its containing file', () => {
    expect(graph.fileOf(SYMBOL)).toBe(FILE);
  });

  it('maps a file to itself (a file is its own container)', () => {
    expect(graph.fileOf(FILE)).toBe(FILE);
  });

  it('returns undefined for an id that is neither a known symbol nor a file', () => {
    expect(graph.fileOf('unknown.')).toBeUndefined();
  });
});
