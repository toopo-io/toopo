/**
 * S2 — pure row<->core mappers (no database). Verifies lossless round-trips for
 * every node kind and both edge resolutions, the JSON boundary normalization
 * across the two backends' readback shapes (libSQL returns JSON as a string,
 * Postgres jsonb returns a parsed object), and that a corrupt row is rejected at
 * the Zod boundary (ADR-0006, ADR-0017 §10) rather than silently rehydrated.
 */
import { type Edge, edgeIdentityKey, type Node } from '@toopo/core';
import { describe, expect, it } from 'vitest';
import type { EdgeTable, NodeTable } from '../schema/graph-types.js';
import { edgeToInsert, nodeToInsert, rowToEdge, rowToNode } from './graph-records.js';

type NodeRow = { [K in keyof NodeTable]: unknown };
type EdgeRow = { [K in keyof EdgeTable]: unknown };

/** Round-trip a node through the insert mapper and back, as a libSQL-style row. */
function roundTripNode(node: Node, fileId: string | null = null): Node {
  return rowToNode(nodeToInsert(node, fileId) as NodeRow);
}

function roundTripEdge(edge: Edge, fileId: string | null = null): Edge {
  return rowToEdge(edgeToInsert(edge, fileId) as EdgeRow);
}

describe('node mappers', () => {
  it('round-trips a repo node', () => {
    const node: Node = { kind: 'repo', id: 'repo1', name: 'toopo', properties: {} };
    expect(roundTripNode(node)).toEqual(node);
  });

  it('round-trips a package node with an optional version', () => {
    const node: Node = {
      kind: 'package',
      id: 'pkg1',
      name: '@toopo/core',
      version: '0.0.0',
      properties: {},
    };
    expect(roundTripNode(node)).toEqual(node);
  });

  it('round-trips a file node with its required analysis and content hash', () => {
    const node: Node = {
      kind: 'file',
      id: 'file1',
      path: 'src/index.ts',
      contentHash: 'sha256:abc',
      analysis: { status: 'analyzed' },
      properties: {},
    };
    expect(roundTripNode(node)).toEqual(node);
  });

  it('round-trips a symbol node with subKind, location and open properties', () => {
    const node: Node = {
      kind: 'symbol',
      id: 'sym1',
      name: 'withResolution',
      subKind: 'ts:function',
      location: {
        start: { row: 1, column: 0 },
        end: { row: 5, column: 1 },
        startByte: 10,
        endByte: 80,
      },
      properties: { exported: true, nested: { a: [1, 2, 3], b: null } },
    };
    expect(roundTripNode(node)).toEqual(node);
  });

  it('round-trips a callSite node with its payload array', () => {
    const node: Node = {
      kind: 'callSite',
      id: 'cs1',
      enclosingSymbolId: 'sym1',
      callee: 'useState',
      ordinal: 2,
      payload: [
        { ordinal: 0, passKind: 'positional', value: '0', resolution: 'deterministic' },
        { ordinal: 1, passKind: 'spread', resolution: 'inferred', confidence: 'low' },
      ],
      properties: {},
    };
    expect(roundTripNode(node)).toEqual(node);
  });

  it('round-trips a package node without a version', () => {
    const node: Node = { kind: 'package', id: 'pkg2', name: 'unversioned', properties: {} };
    expect(roundTripNode(node)).toEqual(node);
  });

  it('round-trips a callSite node with an empty payload', () => {
    const node: Node = {
      kind: 'callSite',
      id: 'cs2',
      enclosingSymbolId: 'sym1',
      callee: 'noop',
      ordinal: 0,
      payload: [],
      properties: {},
    };
    expect(roundTripNode(node)).toEqual(node);
  });

  it('round-trips a non-analyzed node preserving its degradation reason', () => {
    const node: Node = {
      kind: 'file',
      id: 'file2',
      path: 'src/broken.ts',
      contentHash: 'sha256:def',
      analysis: { status: 'parse-error', reason: 'unexpected token' },
      properties: {},
    };
    expect(roundTripNode(node)).toEqual(node);
  });

  it('normalizes a Postgres-style row whose JSON columns are already parsed', () => {
    const row: NodeRow = {
      id: 'sym2',
      kind: 'symbol',
      sub_kind: null,
      name: 'foo',
      path: null,
      content_hash: null,
      version: null,
      enclosing_symbol_id: null,
      callee: null,
      ordinal: null,
      analysis_status: null,
      analysis_reason: null,
      file_id: null,
      location: null,
      payload: null,
      properties: { parsed: true }, // object, not a string — Postgres jsonb readback
    };
    expect(rowToNode(row)).toEqual({
      kind: 'symbol',
      id: 'sym2',
      name: 'foo',
      properties: { parsed: true },
    });
  });

  it('rejects a row with an unknown node kind at the boundary', () => {
    const row = { kind: 'mystery', id: 'x', properties: '{}' } as unknown as NodeRow;
    expect(() => rowToNode(row)).toThrow(/unknown node kind/);
  });
});

describe('edge mappers', () => {
  const deterministic: Edge = {
    kind: 'calls',
    sourceId: 'sym1',
    targetId: 'sym2',
    resolution: 'deterministic',
    provenance: { pass: 'resolve', rule: 'call-graph' },
  };

  const inferred: Edge = {
    kind: 'references',
    sourceId: 'sym1',
    targetId: 'sym3',
    subKind: 'ts:typeRef',
    resolution: 'inferred',
    confidence: 'medium',
    provenance: { pass: 'resolve', rule: 'type-ref' },
  };

  it('keys the insert row by the canonical edge identity', () => {
    expect(edgeToInsert(deterministic, null).edge_key).toBe(edgeIdentityKey(deterministic));
  });

  it('writes confidence only for inferred edges', () => {
    expect(edgeToInsert(deterministic, null).confidence).toBeNull();
    expect(edgeToInsert(inferred, null).confidence).toBe('medium');
  });

  it('round-trips a deterministic edge', () => {
    expect(roundTripEdge(deterministic)).toEqual(deterministic);
  });

  it('round-trips an inferred edge with subKind and confidence', () => {
    expect(roundTripEdge(inferred)).toEqual(inferred);
  });

  it('rejects a corrupt inferred row missing its confidence', () => {
    const row: EdgeRow = {
      edge_key: 'k',
      source_id: 'a',
      target_id: 'b',
      kind: 'calls',
      sub_kind: null,
      resolution: 'inferred',
      confidence: null,
      provenance_pass: 'resolve',
      provenance_rule: 'r',
      file_id: null,
    };
    expect(() => rowToEdge(row)).toThrow();
  });
});
