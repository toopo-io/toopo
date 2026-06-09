import type { Node } from '@toopo/core';
import { describe, expect, it } from 'vitest';
import { buildScopeTrail, drillTarget, searchJumpState } from './navigation';

describe('drillTarget', () => {
  it('descends package → file scoped to the package', () => {
    expect(drillTarget('package', '@toopo/db')).toEqual({ level: 'file', scope: '@toopo/db' });
  });
  it('descends file → symbol scoped to the file', () => {
    expect(drillTarget('file', 'pkg/a.ts')).toEqual({ level: 'symbol', scope: 'pkg/a.ts' });
  });
  it('returns null at the symbol level (a click opens the detail panel)', () => {
    expect(drillTarget('symbol', 'pkg/a.ts#X')).toBeNull();
  });
});

describe('buildScopeTrail', () => {
  it('is just the root at the package level', () => {
    const trail = buildScopeTrail({ level: 'package', rootLabel: 'Packages' });
    expect(trail).toEqual([
      { label: 'Packages', target: { level: 'package', blast: false }, isCurrent: true },
    ]);
  });

  it('shows Packages › <package> at the file level', () => {
    const trail = buildScopeTrail({ level: 'file', scope: '@toopo/db', rootLabel: 'Packages' });
    expect(trail.map((c) => c.label)).toEqual(['Packages', '@toopo/db']);
    expect(trail[0]?.isCurrent).toBe(false);
    expect(trail[1]).toMatchObject({
      isCurrent: true,
      target: { level: 'file', scope: '@toopo/db', blast: false },
    });
  });

  it('shows Packages › <package> › <file> at the symbol level with a resolved ancestor', () => {
    const trail = buildScopeTrail({
      level: 'symbol',
      scope: 'packages/db/src/x.ts',
      rootLabel: 'Packages',
      scopeLabel: 'x.ts',
      packageAncestor: { id: '@toopo/db', label: '@toopo/db' },
    });
    expect(trail.map((c) => c.label)).toEqual(['Packages', '@toopo/db', 'x.ts']);
    expect(trail[1]?.target).toEqual({ level: 'file', scope: '@toopo/db', blast: false });
    expect(trail[2]?.isCurrent).toBe(true);
  });

  it('omits the package crumb when the ancestor is unresolved, falling back to the raw id', () => {
    const trail = buildScopeTrail({
      level: 'symbol',
      scope: 'packages/db/src/x.ts',
      rootLabel: 'Packages',
    });
    expect(trail.map((c) => c.label)).toEqual(['Packages', 'packages/db/src/x.ts']);
  });
});

describe('searchJumpState', () => {
  const current: import('./view-state').GraphViewState = { level: 'package', blast: false };
  const pkg: Node = { kind: 'package', id: '@toopo/db', name: '@toopo/db', properties: {} };
  const file: Node = {
    kind: 'file',
    id: 'packages/db/src/x.ts',
    path: 'packages/db/src/x.ts',
    contentHash: 'h',
    analysis: { status: 'analyzed' },
    properties: {},
  };
  const symbol: Node = { kind: 'symbol', id: 'packages/db/src/x.ts#X', name: 'X', properties: {} };

  it('scopes the map to a chosen package (its files)', () => {
    expect(searchJumpState(pkg, current)).toEqual({
      level: 'file',
      scope: '@toopo/db',
      blast: false,
    });
  });
  it('scopes the map to a chosen file (its symbols)', () => {
    expect(searchJumpState(file, current)).toEqual({
      level: 'symbol',
      scope: 'packages/db/src/x.ts',
      blast: false,
    });
  });
  it('opens the detail panel in place for a chosen symbol', () => {
    const scoped: import('./view-state').GraphViewState = {
      level: 'symbol',
      scope: 'packages/db/src/x.ts',
      blast: false,
    };
    expect(searchJumpState(symbol, scoped)).toEqual({ ...scoped, node: 'packages/db/src/x.ts#X' });
  });
});
