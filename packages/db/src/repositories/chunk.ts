/**
 * Slice rows into size-bounded batches for bulk statements. Both backends bind
 * each column of each row as a parameter, and SQLite's default ceiling is 32766
 * bound parameters per statement (ADR-0017 §6) — callers pick a chunk size that
 * keeps `rows × columns` comfortably under it.
 */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}
