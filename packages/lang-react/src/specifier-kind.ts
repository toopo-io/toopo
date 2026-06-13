/**
 * Classify a module specifier and extract an npm package name (ADR-0016). Shared
 * by the Parse pass (which emits external `imports` edges) and the Resolve pass
 * (which resolves relative specifiers and classifies bare re-export sources), so
 * the two never disagree on what "relative", "alias", or "bare" means.
 */

/** A relative specifier (`./x`, `../y`). */
export function isRelative(specifier: string): boolean {
  return specifier.startsWith('.');
}

/** A path-alias specifier (`@/x`, `~/x`) — resolved via tsconfig paths (Slice 4). */
export function isAlias(specifier: string): boolean {
  return specifier.startsWith('@/') || specifier.startsWith('~/');
}

/** The npm package name of a bare specifier (a scoped name keeps its two segments). */
export function packageName(specifier: string): string {
  const segments = specifier.split('/');
  if (specifier.startsWith('@')) {
    return segments.slice(0, 2).join('/');
  }
  return segments[0] ?? specifier;
}
