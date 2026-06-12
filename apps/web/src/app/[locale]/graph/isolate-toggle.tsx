'use client';

/**
 * Isolate-inferred toggle: fades the deterministic (proven) edges so only the
 * inferred (heuristic) dependencies stand out — a one-click read of exactly which
 * relationships are guesses (ADR-0015 §8, the trust principle). It dims rather
 * than removes, so the layout never shifts under the viewer.
 */
import { useTranslations } from 'next-intl';
import type { JSX } from 'react';

interface IsolateToggleProps {
  readonly active: boolean;
  readonly onToggle: () => void;
}

export function IsolateToggle({ active, onToggle }: IsolateToggleProps): JSX.Element {
  const t = useTranslations('Graph');
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onToggle}
      title={t('isolate.aria')}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-medium text-xs shadow-sm backdrop-blur transition-colors ${
        active
          ? 'border-(--tp-inferred) bg-card/90 text-(--tp-inferred)'
          : 'border-border bg-card/90 text-muted-foreground hover:bg-accent'
      }`}
    >
      <span aria-hidden="true" className="size-2 rounded-full bg-(--tp-inferred)" />
      {t('isolate.label')}
    </button>
  );
}
