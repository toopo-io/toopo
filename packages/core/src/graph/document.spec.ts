import { describe, expect, it } from 'vitest';
import { FORMAT_VERSION } from '../constants';
import type { Edge } from '../edges/edge';
import type { Node } from '../nodes/node';
import { canonicalizeGraphDocument, type GraphDocument, GraphDocumentSchema } from './document';

const nodeA: Node = { kind: 'symbol', id: 'a', name: 'a', properties: {} };
const nodeB: Node = { kind: 'symbol', id: 'b', name: 'b', properties: {} };
const edgeAB: Edge = {
  kind: 'calls',
  sourceId: 'a',
  targetId: 'b',
  resolution: 'deterministic',
  provenance: { pass: 'resolve', rule: 'test' },
};

describe('GraphDocumentSchema', () => {
  it('accepts a populated document', () => {
    const result = GraphDocumentSchema.safeParse({
      formatVersion: FORMAT_VERSION,
      nodes: [nodeA, nodeB],
      edges: [edgeAB],
    });
    expect(result.success).toBe(true);
  });

  it('accepts an empty fragment (file-level incremental unit)', () => {
    const result = GraphDocumentSchema.safeParse({
      formatVersion: FORMAT_VERSION,
      nodes: [],
      edges: [],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a wrong format version', () => {
    const result = GraphDocumentSchema.safeParse({
      formatVersion: FORMAT_VERSION + 1,
      nodes: [],
      edges: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('canonicalizeGraphDocument', () => {
  it('returns a new document with nodes and edges in canonical order', () => {
    const document: GraphDocument = {
      formatVersion: FORMAT_VERSION,
      nodes: [nodeB, nodeA],
      edges: [edgeAB],
    };
    const canonical = canonicalizeGraphDocument(document);
    expect(canonical.nodes.map((n) => n.id)).toEqual(['a', 'b']);
    expect(document.nodes.map((n) => n.id)).toEqual(['b', 'a']);
  });
});
