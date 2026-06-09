import type { Node } from '@toopo/core';
import { describe, expect, it } from 'vitest';
import { nodeLabel } from './node-label';

describe('nodeLabel', () => {
  it('uses the declared name for repo, package and symbol', () => {
    const repo: Node = { kind: 'repo', id: 'r', name: 'toopo', properties: {} };
    const pkg: Node = { kind: 'package', id: 'p', name: '@toopo/web', properties: {} };
    const symbol: Node = { kind: 'symbol', id: 's', name: 'GraphExplorer', properties: {} };
    expect(nodeLabel(repo)).toBe('toopo');
    expect(nodeLabel(pkg)).toBe('@toopo/web');
    expect(nodeLabel(symbol)).toBe('GraphExplorer');
  });

  it('uses the file basename, not the full descriptor path', () => {
    const file: Node = {
      kind: 'file',
      id: 'apps/web/src/lib/graph/node-label.ts',
      path: 'apps/web/src/lib/graph/node-label.ts',
      contentHash: 'abc',
      analysis: { status: 'analyzed' },
      properties: {},
    };
    expect(nodeLabel(file)).toBe('node-label.ts');
  });

  it('handles Windows separators in a file path', () => {
    const file: Node = {
      kind: 'file',
      id: 'a\\b\\c.ts',
      path: 'a\\b\\c.ts',
      contentHash: 'h',
      analysis: { status: 'analyzed' },
      properties: {},
    };
    expect(nodeLabel(file)).toBe('c.ts');
  });

  it('uses the callee for a call-site', () => {
    const callSite: Node = {
      kind: 'callSite',
      id: 'f/foo#calls[0]',
      enclosingSymbolId: 'f/foo#',
      callee: 'useQuery',
      ordinal: 0,
      payload: [],
      properties: {},
    };
    expect(nodeLabel(callSite)).toBe('useQuery');
  });
});
