import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
let currentSearch = '';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/en/graph',
  useSearchParams: () => new URLSearchParams(currentSearch),
}));

import { useGraphViewState } from './use-graph-view-state';

afterEach(() => {
  push.mockClear();
  currentSearch = '';
});

describe('useGraphViewState', () => {
  it('parses the current URL into typed state', () => {
    currentSearch = 'level=file&scope=pkgA';
    const { result } = renderHook(() => useGraphViewState());
    expect(result.current.state).toMatchObject({ level: 'file', scope: 'pkgA' });
  });

  it('pushes a clean URL (no query) when returning to the package default', () => {
    currentSearch = 'level=file&scope=pkgA';
    const { result } = renderHook(() => useGraphViewState());
    act(() => {
      result.current.setState({ level: 'package', blast: false });
    });
    expect(push).toHaveBeenCalledWith('/en/graph');
  });

  it('update() merges a patch onto the current state and pushes it', () => {
    currentSearch = '';
    const { result } = renderHook(() => useGraphViewState());
    act(() => {
      result.current.update({ level: 'file', scope: 'pkgA' });
    });
    expect(push).toHaveBeenCalledWith('/en/graph?level=file&scope=pkgA');
  });

  it('encodes a selected SCIP node id in the pushed URL', () => {
    currentSearch = '';
    const { result } = renderHook(() => useGraphViewState());
    act(() => {
      result.current.update({ node: 'a/b#' });
    });
    const href = push.mock.calls[0]?.[0] as string;
    expect(href).not.toContain('#');
    expect(href).toContain('node=a%2Fb');
  });
});
