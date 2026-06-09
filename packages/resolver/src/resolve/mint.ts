import type { Confidence, Edge, EdgeKind, SymbolId } from '@toopo/core';
import type { Certainty, ResolvedEdge } from '../plugin/resolver-plugin.js';

/**
 * Mint a core `Edge` from a plugin's {@link ResolvedEdge} descriptor (ADR-0016
 * Resolve pass; provenance `resolve`). This is the SINGLE place a plugin's
 * certainty becomes an edge's `resolution`, and the mapping is 1:1 — the engine
 * can never turn an `inferred` verdict into a `deterministic` edge (ADR-0015 §8,
 * the trust guarantee). Carrying `confidence` exactly when `inferred` is
 * enforced by the core schema this constructs.
 */
export function mintEdge(descriptor: ResolvedEdge): Edge {
  return buildResolveEdge(
    descriptor.kind,
    descriptor.sourceId,
    descriptor.targetId,
    descriptor.rule,
    descriptor.certainty,
    descriptor.subKind,
  );
}

/** Build a resolve-pass edge with the given certainty (used by both import and
 * call-site binding). The base shape is shared; the trust discriminator is the
 * only thing that varies. */
export function buildResolveEdge(
  kind: EdgeKind,
  sourceId: SymbolId,
  targetId: SymbolId,
  rule: string,
  certainty: Certainty,
  subKind?: string,
): Edge {
  const base = {
    kind,
    sourceId,
    targetId,
    provenance: { pass: 'resolve' as const, rule },
    ...(subKind === undefined ? {} : { subKind }),
  };
  return certainty.resolution === 'deterministic'
    ? { ...base, resolution: 'deterministic' }
    : { ...base, resolution: 'inferred', confidence: certainty.confidence };
}

const CONFIDENCE_RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };

/**
 * Combine two certainties along a resolution path (e.g. module + export): the
 * result is `deterministic` only if BOTH are, otherwise `inferred` at the LOWER
 * of the two confidences (a deterministic step contributes the highest
 * confidence). Conservative by construction — a path is only as certain as its
 * least-certain step (the trust principle).
 */
export function combineCertainty(a: Certainty, b: Certainty): Certainty {
  if (a.resolution === 'deterministic' && b.resolution === 'deterministic') {
    return { resolution: 'deterministic' };
  }
  const confidence = lowerConfidence(confidenceOf(a), confidenceOf(b));
  return { resolution: 'inferred', confidence };
}

function confidenceOf(certainty: Certainty): Confidence {
  return certainty.resolution === 'inferred' ? certainty.confidence : 'high';
}

function lowerConfidence(a: Confidence, b: Confidence): Confidence {
  return CONFIDENCE_RANK[a] <= CONFIDENCE_RANK[b] ? a : b;
}
