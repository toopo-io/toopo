'use client';

/**
 * React binding for the URL-encoded explorer state (ADR-0020 Fork 3). Reads the
 * current state from the live search params and writes changes by pushing a new
 * URL, so every view is deep-linkable and the browser Back button navigates the
 * exploration history. The parse/serialize logic is the pure `view-state` module;
 * this only wires it to Next's router.
 */
import type { Route } from 'next';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { type GraphViewState, graphViewStateToParams, parseGraphViewState } from './view-state';

export interface UseGraphViewState {
  readonly state: GraphViewState;
  readonly setState: (next: GraphViewState) => void;
  readonly update: (patch: Partial<GraphViewState>) => void;
}

export function useGraphViewState(): UseGraphViewState {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const state = useMemo(
    () => parseGraphViewState(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const setState = useCallback(
    (next: GraphViewState): void => {
      const query = graphViewStateToParams(next).toString();
      const href = query.length > 0 ? `${pathname}?${query}` : pathname;
      router.push(href as Route);
    },
    [router, pathname],
  );

  const update = useCallback(
    (patch: Partial<GraphViewState>): void => {
      setState({ ...state, ...patch });
    },
    [setState, state],
  );

  return { state, setState, update };
}
