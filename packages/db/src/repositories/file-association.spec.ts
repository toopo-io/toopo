/**
 * S3 — the pure containment walk that derives `file_id`. Verifies a symbol and
 * call-site resolve to their enclosing file, a file is its own file, repo and
 * package resolve to null, an edge takes its source's file, and a malformed
 * containment cycle degrades to null rather than looping.
 */
import { type Edge, FORMAT_VERSION, type GraphDocument, type Node } from '@toopo/core';
import { describe, expect, it } from 'vitest';
import { buildFileIndex } from './file-association.js';

function contains(sourceId: string, targetId: string): Edge {
  return {
    kind: 'contains',
    sourceId,
    targetId,
    resolution: 'deterministic',
    provenance: { pass: 'parse', rule: 'containment' },
  };
}

const repo: Node = { kind: 'repo', id: 'repo', name: 'r', properties: {} };
const pkg: Node = { kind: 'package', id: 'pkg', name: 'p', properties: {} };
const file: Node = {
  kind: 'file',
  id: 'file',
  path: 'a.ts',
  contentHash: 'h',
  analysis: { status: 'analyzed' },
  properties: {},
};
const symbol: Node = { kind: 'symbol', id: 'sym', name: 's', properties: {} };
const callSite: Node = {
  kind: 'callSite',
  id: 'cs',
  enclosingSymbolId: 'sym',
  callee: 'f',
  ordinal: 0,
  payload: [],
  properties: {},
};

const document: GraphDocument = {
  formatVersion: FORMAT_VERSION,
  nodes: [repo, pkg, file, symbol, callSite],
  edges: [
    contains('repo', 'pkg'),
    contains('pkg', 'file'),
    contains('file', 'sym'),
    contains('sym', 'cs'),
  ],
};

describe('buildFileIndex', () => {
  const index = buildFileIndex(document);

  it('maps a file node to itself', () => {
    expect(index.forNode('file')).toBe('file');
  });

  it('maps a symbol to its enclosing file', () => {
    expect(index.forNode('sym')).toBe('file');
  });

  it('maps a transitively-contained call-site to its file', () => {
    expect(index.forNode('cs')).toBe('file');
  });

  it('maps repo and package above the file level to null', () => {
    expect(index.forNode('repo')).toBeNull();
    expect(index.forNode('pkg')).toBeNull();
  });

  it('maps an unknown id to null', () => {
    expect(index.forNode('nope')).toBeNull();
  });

  it('assigns an edge to the file of its source', () => {
    const edge: Edge = {
      kind: 'calls',
      sourceId: 'sym',
      targetId: 'other',
      resolution: 'deterministic',
      provenance: { pass: 'resolve', rule: 'call' },
    };
    expect(index.forEdge(edge)).toBe('file');
  });

  it('degrades a malformed containment cycle to null without looping', () => {
    const cyclic: GraphDocument = {
      formatVersion: FORMAT_VERSION,
      nodes: [
        { kind: 'symbol', id: 'a', name: 'a', properties: {} },
        { kind: 'symbol', id: 'b', name: 'b', properties: {} },
      ],
      edges: [contains('a', 'b'), contains('b', 'a')],
    };
    const cyclicIndex = buildFileIndex(cyclic);
    expect(cyclicIndex.forNode('a')).toBeNull();
    expect(cyclicIndex.forNode('b')).toBeNull();
  });
});
