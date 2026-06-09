/**
 * The visual language of trust (ADR-0015 §8, the trust principle — NON-NEGOTIABLE).
 *
 * Deterministic and inferred facts are NEVER merged, in the data or the UI.
 * Across every zoom level the rule is the same: a SOLID stroke is deterministic
 * (statically proven), a DASHED stroke is inferred (a heuristic guess). The
 * colours live as CSS custom properties (defined in `graph.css`, light/dark
 * aware) so the palette is themable in one place. Confidence — carried only by
 * inferred facts — modulates opacity, so a low-confidence guess reads as fainter
 * than a high-confidence one without ever being mistaken for a proven fact.
 */
import type { Confidence } from '@toopo/core';
import type { CSSProperties } from 'react';

/** A single fact's trust. Mirrors core's edge `resolution` (ADR-0015 §8). */
export type TrustKind = 'deterministic' | 'inferred';

/** Dash pattern per trust kind: deterministic solid, inferred dashed. */
export const TRUST_DASHARRAY: Record<TrustKind, string | undefined> = {
  deterministic: undefined,
  inferred: '6 4',
};

/** Themable stroke colour per trust kind (see `graph.css`). */
export const TRUST_COLOR_VAR: Record<TrustKind, string> = {
  deterministic: 'var(--toopo-trust-deterministic)',
  inferred: 'var(--toopo-trust-inferred)',
};

/**
 * Curvature sign per trust kind. The two aggregated edges between the same pair
 * of containers (ADR-0020 V1: a solid one for the deterministic count, a dashed
 * one for the inferred count) bow in OPPOSITE directions so both stay legible
 * and visibly separate — never a single merged line.
 */
export const TRUST_CURVATURE: Record<TrustKind, number> = {
  deterministic: 0.3,
  inferred: -0.3,
};

export const TRUST_STROKE_WIDTH = 1.5;

/** Opacity per inferred confidence; deterministic is always fully opaque. */
const CONFIDENCE_OPACITY: Record<Confidence, number> = {
  high: 1,
  medium: 0.8,
  low: 0.6,
};

/**
 * The SVG stroke style for an edge of a given trust kind. `confidence` is only
 * meaningful for `inferred` edges (it is ignored for deterministic ones, which
 * carry no confidence by the §8 invariant).
 */
export function trustEdgeStyle(kind: TrustKind, confidence?: Confidence): CSSProperties {
  const dasharray = TRUST_DASHARRAY[kind];
  const opacity =
    kind === 'inferred' && confidence !== undefined ? CONFIDENCE_OPACITY[confidence] : 1;
  return {
    stroke: TRUST_COLOR_VAR[kind],
    strokeWidth: TRUST_STROKE_WIDTH,
    opacity,
    ...(dasharray !== undefined ? { strokeDasharray: dasharray } : {}),
  };
}
