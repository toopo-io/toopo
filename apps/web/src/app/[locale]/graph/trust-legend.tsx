'use client';

/**
 * The persistent trust legend (ADR-0015 §8 — trust must be visible, always).
 * It names the two kinds and shows their exact strokes (solid vs dashed, in the
 * two trust hues), so a reader is never left guessing which relationships are
 * proven and which are inferred guesses.
 */
import { useTranslations } from 'next-intl';
import type { JSX } from 'react';
import { TRUST_COLOR_VAR, TRUST_DASHARRAY } from '../../../lib/graph/trust';

function Sample({ kind }: { kind: 'deterministic' | 'inferred' }): JSX.Element {
  return (
    <svg width="28" height="8" viewBox="0 0 28 8" aria-hidden="true">
      <line
        x1="0"
        y1="4"
        x2="28"
        y2="4"
        stroke={TRUST_COLOR_VAR[kind]}
        strokeWidth="2"
        {...(TRUST_DASHARRAY[kind] !== undefined ? { strokeDasharray: TRUST_DASHARRAY[kind] } : {})}
      />
    </svg>
  );
}

export function TrustLegend(): JSX.Element {
  const t = useTranslations('Graph.legend');
  return (
    <div className="pointer-events-none absolute top-3 right-3 z-10 rounded-lg border border-border bg-card/90 px-3 py-2 text-xs shadow-sm backdrop-blur">
      <p className="mb-1.5 font-medium text-muted-foreground">{t('title')}</p>
      <ul className="flex flex-col gap-1">
        <li className="flex items-center gap-2">
          <Sample kind="deterministic" />
          <span>{t('deterministic')}</span>
        </li>
        <li className="flex items-center gap-2">
          <Sample kind="inferred" />
          <span>{t('inferred')}</span>
        </li>
      </ul>
    </div>
  );
}
