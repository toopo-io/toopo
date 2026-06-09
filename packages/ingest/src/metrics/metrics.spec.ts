import { type Edge, formatSymbolId, type Node } from '@toopo/core';
import type { Diagnostic } from '@toopo/resolver';
import { describe, expect, it } from 'vitest';
import type { IngestResult } from '../ingest/ingest-project.js';
import { computeMetrics } from './metrics';

const local = (name: string): string => formatSymbolId({ descriptors: [{ name, suffix: 'term' }] });
const EXTERNAL = formatSymbolId({
  package: { manager: 'npm', name: 'react' },
  descriptors: [{ name: 'useState', suffix: 'term' }],
});

function importEdge(targetId: string, resolution: 'deterministic' | 'inferred'): Edge {
  const base = {
    kind: 'imports' as const,
    sourceId: local('App'),
    targetId,
    provenance: { pass: 'resolve' as const, rule: 'resolve/import' },
  };
  return resolution === 'deterministic'
    ? { ...base, resolution }
    : { ...base, resolution, confidence: 'high' };
}

function relEdge(kind: 'calls' | 'references', subKind: string): Edge {
  return {
    kind,
    subKind,
    sourceId: local('site'),
    targetId: local('Button'),
    provenance: { pass: 'resolve', rule: 'resolve/x' },
    resolution: 'deterministic',
  };
}

// Metric-shaped node fixtures — computeMetrics reads only kind and subKind.
const symbol = (subKind: string): Node => ({ kind: 'symbol', subKind }) as unknown as Node;
const file = (): Node => ({ kind: 'file' }) as unknown as Node;

const diag = (code: Diagnostic['code']): Diagnostic => ({
  code,
  importerFileId: local('App'),
  specifier: './x',
  message: 'm',
});

function makeResult(): IngestResult {
  return {
    document: {
      formatVersion: 1,
      nodes: [file(), symbol('react:component'), symbol('ts:function')],
      edges: [
        importEdge(local('Button'), 'deterministic'),
        importEdge(local('useThing'), 'inferred'),
        importEdge(EXTERNAL, 'deterministic'),
        relEdge('calls', 'react:renders'),
        relEdge('calls', 'react:calls'),
        relEdge('references', 'react:propBinding'),
        relEdge('references', 'ts:argBinding'),
      ],
    },
    diagnostics: [diag('ambiguous-module'), diag('unresolved-module'), diag('unresolved-export')],
    files: [
      { path: 'a.tsx', status: 'analyzed' },
      { path: 'b.ts', status: 'parse-error', reason: 'react: source contains syntax errors.' },
      { path: 'c.css', status: 'unsupported-language', reason: 'no plugin' },
    ],
    timings: { discoverMs: 1, parseMs: 2, resolveMs: 3 },
  };
}

describe('computeMetrics', () => {
  it('breaks down import resolution with separate overall and deterministic rates', () => {
    const { imports } = computeMetrics(makeResult());
    // 3 resolved (1 det internal, 1 inferred, 1 external) + 3 not-resolved (1 ambiguous, 2 unresolved).
    expect(imports.deterministic).toBe(1);
    expect(imports.inferred).toBe(1);
    expect(imports.external).toBe(1);
    expect(imports.ambiguous).toBe(1);
    expect(imports.unresolved).toBe(2);
    expect(imports.total).toBe(6);
    expect(imports.resolved).toBe(3);
    expect(imports.overallResolutionRate).toBeCloseTo(0.5);
    expect(imports.deterministicShare).toBeCloseTo(1 / 6);
  });

  it('counts cross-file relationships by kind', () => {
    const { relationships } = computeMetrics(makeResult());
    expect(relationships).toMatchObject({ renders: 1, calls: 1, propBindings: 1, argBindings: 1 });
  });

  it('counts discovery outcomes and names parse-error causes', () => {
    const metrics = computeMetrics(makeResult());
    expect(metrics.discovery).toEqual({
      discovered: 3,
      analyzed: 1,
      parseError: 1,
      unsupported: 1,
      skipped: 0,
    });
    expect(metrics.parseErrors).toEqual([
      { path: 'b.ts', reason: 'react: source contains syntax errors.' },
    ]);
  });

  it('tallies nodes and symbol subKinds', () => {
    const { graph } = computeMetrics(makeResult());
    expect(graph.nodesByKind).toEqual({ file: 1, symbol: 2 });
    expect(graph.symbolsBySubKind).toEqual({ 'react:component': 1, 'ts:function': 1 });
  });

  it('reports a zero resolution rate for a project with no imports', () => {
    const empty: IngestResult = {
      document: { formatVersion: 1, nodes: [], edges: [] },
      diagnostics: [],
      files: [],
      timings: { discoverMs: 0, parseMs: 0, resolveMs: 0 },
    };
    const { imports } = computeMetrics(empty);
    expect(imports.total).toBe(0);
    expect(imports.overallResolutionRate).toBe(0);
  });
});
