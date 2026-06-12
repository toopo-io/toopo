import type { CallBinding, NodeDetail } from '@toopo/api-contracts';
import type { Edge, Node } from '@toopo/core';
import { describe, expect, it } from 'vitest';
import { callBindingRows, declarationBuckets, nodeDetailToViewModel } from './node-detail-adapter';

const detEdge = (sourceId: string, targetId: string): Edge => ({
  kind: 'calls',
  sourceId,
  targetId,
  provenance: { pass: 'parse', rule: 'call-binding' },
  resolution: 'deterministic',
});

const infEdge = (sourceId: string, targetId: string): Edge => ({
  kind: 'references',
  sourceId,
  targetId,
  provenance: { pass: 'resolve', rule: 'heuristic' },
  resolution: 'inferred',
  confidence: 'medium',
});

const symbol = (id: string, name: string, subKind?: string): Node => ({
  kind: 'symbol',
  id,
  name,
  ...(subKind !== undefined ? { subKind } : {}),
  properties: {},
});

const DETAIL: NodeDetail = {
  node: { ...symbol('sA', 'Button', 'react:component'), analysis: { status: 'analyzed' } },
  declaredInterface: {
    items: [symbol('sA/label#', 'label', 'react:prop')],
    nextCursor: null,
  },
  incoming: {
    items: [{ edge: detEdge('caller#', 'sA'), node: symbol('caller#', 'Page') }],
    nextCursor: null,
  },
  outgoing: {
    items: [
      { edge: infEdge('sA', 'external#'), node: null },
      { edge: detEdge('sA', 'sB'), node: symbol('sB', 'Icon') },
    ],
    nextCursor: null,
  },
  callSites: {
    items: [
      {
        kind: 'callSite',
        id: 'sA/calls[0]',
        enclosingSymbolId: 'sA',
        callee: 'Icon',
        ordinal: 0,
        payload: [
          { ordinal: 0, passKind: 'named', name: 'size', value: '16', resolution: 'deterministic' },
          {
            ordinal: 1,
            passKind: 'spread',
            value: '{...rest}',
            resolution: 'inferred',
            confidence: 'low',
          },
        ],
        properties: {},
      },
    ],
    nextCursor: null,
  },
};

describe('nodeDetailToViewModel', () => {
  it('maps the node header (label, kind, subKind, analysis)', () => {
    const vm = nodeDetailToViewModel(DETAIL);
    expect(vm).toMatchObject({
      id: 'sA',
      label: 'Button',
      kind: 'symbol',
      subKind: 'react:component',
      analysisStatus: 'analyzed',
    });
  });

  it('lists the parameter rows', () => {
    const vm = nodeDetailToViewModel(DETAIL);
    expect(vm.parameters).toEqual([{ id: 'sA/label#', label: 'label', subKind: 'react:prop' }]);
  });

  it('composes the signature, parses JSDoc, and flags an inferred edge (F2)', () => {
    const documented: NodeDetail = {
      ...DETAIL,
      node: {
        kind: 'symbol',
        id: 'clamp#',
        name: 'clamp',
        subKind: 'ts:function',
        properties: {
          returnType: 'number',
          jsdoc: '/**\n * Clamps.\n * @returns the value\n */',
        },
      },
      declaredInterface: {
        items: [
          { ...symbol('clamp#value', 'value', 'ts:parameter'), properties: { type: 'number' } },
        ],
        nextCursor: null,
      },
    };
    const vm = nodeDetailToViewModel(documented);
    expect(vm.signature).toBe('clamp(value: number): number');
    expect(vm.jsdoc).toEqual({
      description: 'Clamps.',
      tags: [{ tag: 'returns', text: 'the value' }],
    });
    // DETAIL's outgoing carries an inferred reference, so the callout fires.
    expect(vm.hasInferredEdge).toBe(true);
  });

  it('marks callers/callees with the edge trust, using the correct far end', () => {
    const vm = nodeDetailToViewModel(DETAIL);
    // Incoming: far end is the source (the caller).
    expect(vm.callers).toEqual([
      { edgeKind: 'calls', trustKind: 'deterministic', nodeId: 'caller#', label: 'Page' },
    ]);
    // Outgoing: far end is the target (the callee); trust + confidence preserved.
    const external = vm.callees.find((row) => row.nodeId === 'external#');
    expect(external).toEqual({
      edgeKind: 'references',
      trustKind: 'inferred',
      confidence: 'medium',
      nodeId: 'external#',
      label: null, // unresolved id — no invented label
    });
  });

  it('excludes structural contains edges from callers/callees (dependencies only)', () => {
    const withContains: NodeDetail = {
      ...DETAIL,
      outgoing: {
        items: [
          { edge: detEdge('sA', 'sA/child#'), node: symbol('sA/child#', 'child') },
          { edge: { ...detEdge('sA', 'sB'), kind: 'contains' }, node: symbol('sB', 'B') },
        ],
        nextCursor: null,
      },
    };
    const vm = nodeDetailToViewModel(withContains);
    // The 'calls' edge is a dependency; the 'contains' edge is structure — excluded.
    expect(vm.callees).toHaveLength(1);
    expect(vm.callees[0]?.edgeKind).toBe('calls');
  });

  it('surfaces call-site payload args with per-argument trust', () => {
    const vm = nodeDetailToViewModel(DETAIL);
    expect(vm.callSites).toHaveLength(1);
    const args = vm.callSites[0]?.args ?? [];
    expect(args[0]).toMatchObject({ name: 'size', trustKind: 'deterministic' });
    expect(args[1]).toMatchObject({ passKind: 'spread', trustKind: 'inferred', confidence: 'low' });
  });
});

describe('declarationBuckets', () => {
  it('splits children into locals and nested functions, ignoring params/types', () => {
    const buckets = declarationBuckets([
      symbol('a#', 'total', 'ts:variable'),
      symbol('b#', 'helper', 'ts:function'),
      symbol('c#', 'Widget', 'react:component'),
      symbol('d#', 'p', 'ts:parameter'),
      symbol('e#', 'Thing', 'ts:type'),
    ]);
    expect(buckets.locals.map((row) => row.label)).toEqual(['total']);
    expect(buckets.nested.map((row) => row.label)).toEqual(['helper', 'Widget']);
  });
});

describe('callBindingRows', () => {
  it('stitches a bound argument to its parameter as certain', () => {
    const binding: CallBinding = {
      argument: { ordinal: 0, name: 'size', passKind: 'named', resolution: 'deterministic' },
      parameter: symbol('p#size', 'size'),
      edge: detEdge('cs#', 'p#size'),
    };
    expect(callBindingRows([binding])[0]).toMatchObject({
      argName: 'size',
      paramLabel: 'size',
      uncertain: false,
      trustKind: 'deterministic',
    });
  });

  it('marks an unbound or inferred argument uncertain (the accent)', () => {
    const rows = callBindingRows([
      {
        argument: { ordinal: 0, passKind: 'spread', resolution: 'inferred', confidence: 'low' },
        parameter: null,
        edge: null,
      },
      {
        argument: { ordinal: 1, name: 'x', passKind: 'named', resolution: 'deterministic' },
        parameter: symbol('p#x', 'x'),
        edge: infEdge('cs#', 'p#x'),
      },
    ]);
    expect(rows[0]).toMatchObject({ paramLabel: null, uncertain: true, trustKind: 'inferred' });
    expect(rows[1]).toMatchObject({ paramLabel: 'x', uncertain: true, confidence: 'medium' });
  });
});
