'use client';

/**
 * The cartography breadcrumb: the containment trail from the root tier down to
 * the current scope (ADR-0020 zoom). Every crumb but the last navigates back up
 * one level; the trail itself is deep-linkable since it derives from the URL.
 */
import type { JSX } from 'react';
import type { Crumb } from '../../../lib/graph/navigation';
import type { GraphViewState } from '../../../lib/graph/view-state';

interface BreadcrumbProps {
  readonly crumbs: readonly Crumb[];
  readonly onNavigate: (target: GraphViewState) => void;
  readonly ariaLabel: string;
}

export function Breadcrumb({ crumbs, onNavigate, ariaLabel }: BreadcrumbProps): JSX.Element {
  return (
    <nav
      aria-label={ariaLabel}
      className="flex max-w-[60vw] items-center gap-1.5 rounded-lg border border-border bg-card/90 px-3 py-1.5 text-sm shadow-sm backdrop-blur"
    >
      {crumbs.map((crumb, index) => (
        <span
          key={`${crumb.target.level}:${crumb.target.scope ?? ''}`}
          className="flex min-w-0 items-center gap-1.5"
        >
          {index > 0 ? <span className="text-muted-foreground/60">›</span> : null}
          {crumb.isCurrent ? (
            <span className="truncate font-medium text-foreground" aria-current="page">
              {crumb.label}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => onNavigate(crumb.target)}
              className="truncate text-muted-foreground transition-colors hover:text-foreground hover:underline"
            >
              {crumb.label}
            </button>
          )}
        </span>
      ))}
    </nav>
  );
}
