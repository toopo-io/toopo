import type { Edge, EdgeKind } from '@toopo/core';

/**
 * Build a `deterministic` parse-pass edge. Only the structural facts the source
 * explicitly establishes (lexical containment, an imported-and-called external
 * binding) are emitted this way; anything heuristic or cross-file stays out of
 * the deterministic graph (trust principle, ADR-0015 §8). `provenance.rule`
 * records exactly which mapping produced the edge; `subKind` carries the
 * language-namespaced refinement (e.g. `react:renders`, `react:propBinding`).
 */
export function parseEdge(
  kind: EdgeKind,
  sourceId: string,
  targetId: string,
  rule: string,
  subKind?: string,
): Edge {
  return {
    kind,
    sourceId,
    targetId,
    provenance: { pass: 'parse', rule },
    resolution: 'deterministic',
    ...(subKind === undefined ? {} : { subKind }),
  };
}
