'use client';

/**
 * Graph search (ADR-0020 V5): find a package, file or symbol by name/path and
 * jump to it. The input is debounced, then `useGraphSearch` queries the API; a
 * result is chosen to navigate (a container scopes the map, a symbol opens its
 * panel — see `searchJumpState`). Results show the node's kind so the viewer
 * knows what they are jumping to.
 */
import type { Node } from '@toopo/core';
import { useTranslations } from 'next-intl';
import { type JSX, useEffect, useState } from 'react';
import { nodeLabel } from '../../../lib/graph/node-label';
import { SEARCH_MIN_LENGTH, useGraphSearch } from '../../../lib/graph/use-graph-queries';

interface SearchBoxProps {
  readonly locale: string;
  readonly onJump: (node: Node) => void;
}

const DEBOUNCE_MS = 200;

export function SearchBox({ locale, onJump }: SearchBoxProps): JSX.Element {
  const t = useTranslations('Graph.search');
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handle = setTimeout(() => setQuery(input), DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [input]);

  const { data, isFetching } = useGraphSearch(query, locale);
  const results = data?.items ?? [];
  const open = query.trim().length >= SEARCH_MIN_LENGTH;

  const choose = (node: Node): void => {
    onJump(node);
    setInput('');
    setQuery('');
  };

  return (
    <div className="relative w-72">
      <input
        type="search"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder={t('placeholder')}
        aria-label={t('aria')}
        className="w-full rounded-lg border border-border bg-card/90 px-3 py-1.5 text-sm shadow-sm outline-none backdrop-blur focus:border-ring"
      />
      {open ? (
        <ul className="absolute mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
          {isFetching && results.length === 0 ? (
            <li className="px-3 py-2 text-muted-foreground text-sm">{t('searching')}</li>
          ) : results.length === 0 ? (
            <li className="px-3 py-2 text-muted-foreground text-sm">{t('noResults')}</li>
          ) : (
            results.map((node) => (
              <li key={node.id}>
                <button
                  type="button"
                  onClick={() => choose(node)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted"
                >
                  <span className="truncate">{nodeLabel(node)}</span>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground uppercase">
                    {node.kind}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
