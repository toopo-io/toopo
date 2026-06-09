/**
 * A small, deterministic graph fixture for the Serve API e2e — two packages,
 * three files, a component with declared props and a call-site, and dependency
 * edges of both resolutions plus an external (node-less) target. Mirrors the
 * @toopo/db read-primitive fixture so expected aggregates are easy to reason
 * about at the HTTP layer.
 */
import { type Edge, FORMAT_VERSION, type GraphDocument, type Node } from '@toopo/core';

const nodes: Node[] = [
  { kind: 'repo', id: 'repo', name: 'repo', properties: {} },
  { kind: 'package', id: 'pkgA', name: '@x/a', properties: {} },
  { kind: 'package', id: 'pkgB', name: '@x/b', properties: {} },
  {
    kind: 'file',
    id: 'fileA1',
    path: 'a/one.ts',
    contentHash: 'h1',
    analysis: { status: 'analyzed' },
    properties: {},
  },
  {
    kind: 'file',
    id: 'fileA2',
    path: 'a/two.ts',
    contentHash: 'h2',
    analysis: { status: 'analyzed' },
    properties: {},
  },
  {
    kind: 'file',
    id: 'fileB1',
    path: 'b/one.ts',
    contentHash: 'h3',
    analysis: { status: 'analyzed' },
    properties: {},
  },
  { kind: 'symbol', id: 'sA', name: 'Widget', subKind: 'react:component', properties: {} },
  { kind: 'symbol', id: 'sA2', name: 'helper', properties: {} },
  { kind: 'symbol', id: 'sB', name: 'Button', subKind: 'react:component', properties: {} },
  { kind: 'symbol', id: 'propP1', name: 'label', subKind: 'react:prop', properties: {} },
  { kind: 'symbol', id: 'propP2', name: 'onClick', subKind: 'react:prop', properties: {} },
  {
    kind: 'callSite',
    id: 'cs1',
    enclosingSymbolId: 'sA',
    callee: 'helper',
    ordinal: 0,
    payload: [],
    properties: {},
  },
];

function edge(kind: Edge['kind'], sourceId: string, targetId: string, inferred = false): Edge {
  const base = { kind, sourceId, targetId, provenance: { pass: 'resolve', rule: 't' } } as const;
  return inferred
    ? { ...base, resolution: 'inferred', confidence: 'medium' }
    : { ...base, resolution: 'deterministic' };
}

const edges: Edge[] = [
  edge('contains', 'repo', 'pkgA'),
  edge('contains', 'repo', 'pkgB'),
  edge('contains', 'pkgA', 'fileA1'),
  edge('contains', 'pkgA', 'fileA2'),
  edge('contains', 'pkgB', 'fileB1'),
  edge('contains', 'fileA1', 'sA'),
  edge('contains', 'fileA2', 'sA2'),
  edge('contains', 'fileB1', 'sB'),
  edge('contains', 'sA', 'propP1'),
  edge('contains', 'sA', 'propP2'),
  edge('contains', 'sA', 'cs1'),
  edge('calls', 'sA', 'sA2'),
  edge('references', 'sA', 'sB', true),
  edge('imports', 'sA2', 'sB'),
  edge('references', 'sA', 'EXT', true),
];

export const graphFixture: GraphDocument = { formatVersion: FORMAT_VERSION, nodes, edges };
