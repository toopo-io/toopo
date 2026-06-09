import { describe, expect, it } from 'vitest';
import type { Edge } from '../edges/edge';
import type { SymbolIdentity } from '../identity/symbol-id';
import type { Node } from '../nodes/node';
import {
  isCallSiteNode,
  isDeterministicEdge,
  isExternalIdentity,
  isFileNode,
  isInferredEdge,
  isPackageNode,
  isRepoNode,
  isSymbolNode,
} from './guards';

const nodes = {
  repo: { kind: 'repo', id: 'r', name: 'r', properties: {} },
  package: { kind: 'package', id: 'p', name: 'p', properties: {} },
  file: {
    kind: 'file',
    id: 'f',
    path: 'a.ts',
    contentHash: 'h',
    analysis: { status: 'analyzed' },
    properties: {},
  },
  symbol: { kind: 'symbol', id: 's', name: 's', properties: {} },
  callSite: {
    kind: 'callSite',
    id: 'c',
    enclosingSymbolId: 's',
    callee: 'fn',
    ordinal: 0,
    properties: {},
    payload: [],
  },
} satisfies Record<string, Node>;

const provenance = { pass: 'resolve', rule: 'test' } as const;
const deterministicEdge: Edge = {
  kind: 'calls',
  sourceId: 'a',
  targetId: 'b',
  resolution: 'deterministic',
  provenance,
};
const inferredEdge: Edge = {
  kind: 'references',
  sourceId: 'a',
  targetId: 'b',
  resolution: 'inferred',
  confidence: 'medium',
  provenance,
};

describe('node guards', () => {
  it('narrow exactly the matching kind', () => {
    expect(isRepoNode(nodes.repo)).toBe(true);
    expect(isPackageNode(nodes.package)).toBe(true);
    expect(isFileNode(nodes.file)).toBe(true);
    expect(isSymbolNode(nodes.symbol)).toBe(true);
    expect(isCallSiteNode(nodes.callSite)).toBe(true);
    expect(isRepoNode(nodes.symbol)).toBe(false);
  });
});

describe('edge guards', () => {
  it('distinguish deterministic from inferred', () => {
    expect(isDeterministicEdge(deterministicEdge)).toBe(true);
    expect(isInferredEdge(deterministicEdge)).toBe(false);
    expect(isInferredEdge(inferredEdge)).toBe(true);
    expect(isDeterministicEdge(inferredEdge)).toBe(false);
  });
});

describe('isExternalIdentity', () => {
  it('is true only when a package coordinate is present', () => {
    const local: SymbolIdentity = { descriptors: [{ name: 'x', suffix: 'term' }] };
    const external: SymbolIdentity = {
      package: { manager: 'npm', name: 'react' },
      descriptors: [{ name: 'x', suffix: 'term' }],
    };
    expect(isExternalIdentity(local)).toBe(false);
    expect(isExternalIdentity(external)).toBe(true);
  });
});
