import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GRAPH_VIEW_STATE,
  graphViewStateToParams,
  parseGraphViewState,
} from './view-state';

const parse = (qs: string) => parseGraphViewState(new URLSearchParams(qs));

describe('parseGraphViewState', () => {
  it('defaults to the package map when nothing is set', () => {
    expect(parse('')).toEqual(DEFAULT_GRAPH_VIEW_STATE);
  });

  it('reads a valid level, scope, node and blast flag', () => {
    expect(parse('level=file&scope=pkgA&node=sX&blast=1')).toEqual({
      level: 'file',
      scope: 'pkgA',
      node: 'sX',
      blast: true,
    });
  });

  it('ignores an unknown level value', () => {
    expect(parse('level=galaxy').level).toBe('package');
  });

  it('degrades an unscoped symbol level to the package root (the API rejects it)', () => {
    expect(parse('level=symbol')).toEqual({ level: 'package', blast: false });
  });

  it('keeps a symbol level when a scope is present', () => {
    expect(parse('level=symbol&scope=fileA')).toMatchObject({ level: 'symbol', scope: 'fileA' });
  });

  it('treats blast as off unless it is exactly "1"', () => {
    expect(parse('blast=true').blast).toBe(false);
    expect(parse('blast=1').blast).toBe(true);
  });
});

describe('graphViewStateToParams', () => {
  it('omits the package-level default for a clean canonical URL', () => {
    expect(graphViewStateToParams({ level: 'package', blast: false }).toString()).toBe('');
  });

  it('serializes a non-default state and round-trips through the parser', () => {
    const state = { level: 'file' as const, scope: 'pkgA', node: 'a/b#', blast: true };
    const params = graphViewStateToParams(state);
    expect(parseGraphViewState(params)).toEqual(state);
  });

  it('encodes SCIP ids safely in the node param', () => {
    const params = graphViewStateToParams({ level: 'package', node: 'a/b c/`X`#', blast: false });
    expect(params.toString()).not.toContain('`');
    expect(parseGraphViewState(params).node).toBe('a/b c/`X`#');
  });
});
