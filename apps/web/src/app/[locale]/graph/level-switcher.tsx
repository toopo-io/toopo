'use client';

/**
 * The explicit containment-level switch (package → file → symbol). Packages and
 * Files are always reachable (climbing the hierarchy needs no scope); Symbols is
 * GATED — it is only valid scoped to a file (the Serve contract rejects an
 * unscoped symbol query, MapQuerySchema.refine), so it is enabled only once the
 * viewer has drilled to a file. The breadcrumb owns the scoped trail; this owns
 * the level.
 */
import type { MapLevel } from '@toopo/api-contracts';
import { useTranslations } from 'next-intl';
import type { JSX } from 'react';

const LEVELS: readonly MapLevel[] = ['package', 'file', 'symbol'];

interface LevelSwitcherProps {
  readonly level: MapLevel;
  /** Whether the symbol level is reachable (a file scope is active). */
  readonly canSymbol: boolean;
  readonly onSelect: (level: MapLevel) => void;
}

export function LevelSwitcher({ level, canSymbol, onSelect }: LevelSwitcherProps): JSX.Element {
  const t = useTranslations('Graph');
  return (
    <div
      role="toolbar"
      aria-label={t('switcher.aria')}
      className="inline-flex overflow-hidden rounded-md border border-border bg-card/90 text-xs shadow-sm backdrop-blur"
    >
      {LEVELS.map((value) => {
        const active = value === level;
        const disabled = value === 'symbol' && !canSymbol;
        return (
          <button
            key={value}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onSelect(value)}
            className={`border-border border-r px-2.5 py-1 font-medium last:border-r-0 transition-colors ${
              active
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent'
            }`}
          >
            {t(`level.${value}`)}
          </button>
        );
      })}
    </div>
  );
}
