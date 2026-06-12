'use client';

/**
 * A quiet count of what the current view holds: nodes, edges, and how many of
 * those edges are inferred. The inferred figure is shown in the accent and is
 * always present (even at zero) so the proven-vs-guessed balance is legible at a
 * glance — never hidden, never merged (ADR-0015 §8).
 */
import { useTranslations } from 'next-intl';
import type { JSX } from 'react';

interface StatBarProps {
  readonly nodes: number;
  readonly edges: number;
  readonly inferred: number;
}

export function StatBar({ nodes, edges, inferred }: StatBarProps): JSX.Element {
  const t = useTranslations('Graph');
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex items-center gap-2 rounded-lg border border-border bg-card/90 px-3 py-1.5 font-mono text-[11px] text-muted-foreground shadow-sm backdrop-blur">
      <span>{t('stat.nodes', { count: nodes })}</span>
      <span aria-hidden="true">·</span>
      <span>{t('stat.edges', { count: edges })}</span>
      <span aria-hidden="true">·</span>
      <span className="text-(--tp-inferred)">{t('stat.inferred', { count: inferred })}</span>
    </div>
  );
}
