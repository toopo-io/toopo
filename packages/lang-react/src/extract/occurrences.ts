/**
 * Per-name occurrence counting, shared by member extraction (overload
 * disambiguation) and local-variable extraction (shadow disambiguation). Two
 * declarations that share a name AND the same enclosing scope are separated by a
 * numeric disambiguator assigned in source order (ADR-0015 §4, ADR-0027 §2) — the
 * SCIP-consistent choice. This is the single source of that counter (DRY).
 */

/** Take and advance the per-name occurrence counter, returning the current index. */
export function nextOccurrence(occurrences: Map<string, number>, name: string): number {
  const occurrence = occurrences.get(name) ?? 0;
  occurrences.set(name, occurrence + 1);
  return occurrence;
}
