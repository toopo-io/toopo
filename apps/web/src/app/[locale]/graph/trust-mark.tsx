'use client';

/**
 * The per-row trust marker used throughout the detail panel (ADR-0015 §8): a tiny
 * stroke swatch in the trust colour — solid for deterministic, dashed for
 * inferred — so every relationship row carries the same unmistakable solid/dashed
 * distinction the map's edges use. Inferred markers name their confidence in the
 * accessible label.
 */
import type { Confidence } from '@toopo/core';
import type { JSX } from 'react';
import { TRUST_COLOR_VAR, TRUST_DASHARRAY, type TrustKind } from '../../../lib/graph/trust';

interface TrustMarkProps {
  readonly kind: TrustKind;
  readonly confidence?: Confidence;
  readonly label: string;
}

export function TrustMark({ kind, confidence, label }: TrustMarkProps): JSX.Element {
  const dash = TRUST_DASHARRAY[kind];
  const title = confidence !== undefined ? `${label} · ${confidence}` : label;
  return (
    <span className="inline-flex shrink-0 items-center" title={title} data-trust={kind}>
      <svg width="18" height="6" viewBox="0 0 18 6" aria-hidden="true">
        <line
          x1="0"
          y1="3"
          x2="18"
          y2="3"
          stroke={TRUST_COLOR_VAR[kind]}
          strokeWidth="2"
          {...(dash !== undefined ? { strokeDasharray: dash } : {})}
        />
      </svg>
      <span className="sr-only">{title}</span>
    </span>
  );
}
