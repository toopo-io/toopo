import { describe, expect, it } from 'vitest';
import {
  CallSiteNodeSchema,
  FileNodeSchema,
  NodeSchema,
  PackageNodeSchema,
  RepoNodeSchema,
  SymbolNodeSchema,
} from './node';

describe('NodeSchema (discriminated union)', () => {
  it('accepts each universal node kind', () => {
    const repo = { kind: 'repo', id: 'repo', name: 'toopo' };
    const pkg = { kind: 'package', id: 'pkg', name: '@toopo/core' };
    const file = {
      kind: 'file',
      id: 'file',
      path: 'src/index.ts',
      contentHash: 'abc',
      analysis: { status: 'analyzed' },
    };
    const symbol = { kind: 'symbol', id: 'sym', name: 'Button' };
    const callSite = {
      kind: 'callSite',
      id: 'cs',
      enclosingSymbolId: 'sym',
      callee: 'fn',
      ordinal: 0,
    };
    for (const node of [repo, pkg, file, symbol, callSite]) {
      expect(NodeSchema.safeParse(node).success).toBe(true);
    }
  });

  it('rejects an unknown kind', () => {
    expect(NodeSchema.safeParse({ kind: 'module', id: 'x' }).success).toBe(false);
  });

  it('defaults properties to an empty object and payload to an empty array', () => {
    const repo = RepoNodeSchema.parse({ kind: 'repo', id: 'r', name: 'r' });
    expect(repo.properties).toEqual({});
    const cs = CallSiteNodeSchema.parse({
      kind: 'callSite',
      id: 'cs',
      enclosingSymbolId: 's',
      callee: 'fn',
      ordinal: 0,
    });
    expect(cs.payload).toEqual([]);
  });

  it('accepts an optional namespaced subKind and rejects a non-namespaced one', () => {
    expect(
      SymbolNodeSchema.safeParse({ kind: 'symbol', id: 's', name: 'B', subKind: 'react:component' })
        .success,
    ).toBe(true);
    expect(
      SymbolNodeSchema.safeParse({ kind: 'symbol', id: 's', name: 'B', subKind: 'component' })
        .success,
    ).toBe(false);
  });

  it('requires analysis on a file but not on other kinds', () => {
    expect(
      FileNodeSchema.safeParse({ kind: 'file', id: 'f', path: 'a.ts', contentHash: 'h' }).success,
    ).toBe(false);
    expect(PackageNodeSchema.safeParse({ kind: 'package', id: 'p', name: 'p' }).success).toBe(true);
  });

  it('rejects unknown keys (strict)', () => {
    expect(
      SymbolNodeSchema.safeParse({ kind: 'symbol', id: 's', name: 'B', extra: 1 }).success,
    ).toBe(false);
  });
});
