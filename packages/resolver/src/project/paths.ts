/**
 * Pure, POSIX-style repo-path helpers (ADR-0016: the Resolve pass is
 * filesystem-free and platform-independent). They operate only on the
 * repo-relative path strings the parser already produced, so resolution is
 * deterministic on every OS. Plugins use these to build module-resolution
 * candidates that match how the engine keys files (no drift).
 */

/**
 * Normalize a repo-relative path to forward-slash segments, tolerating Windows
 * separators and a leading `./` or `/` — the same normalization the parser's
 * file identity uses, so a file and a candidate path for it always agree.
 */
export function normalizeRepoPath(path: string): string {
  return path.replaceAll('\\', '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

/** The directory portion of a repo-relative path (`''` for a top-level file). */
export function dirname(path: string): string {
  const normalized = normalizeRepoPath(path);
  const index = normalized.lastIndexOf('/');
  return index === -1 ? '' : normalized.slice(0, index);
}

/**
 * Resolve a relative `specifier` (`./x`, `../y/z`) against the importing file,
 * returning a normalized repo-relative base path WITHOUT an extension. `.`
 * segments are dropped and `..` segments pop a directory. The input strings are
 * never mutated.
 */
export function resolveRelative(importerPath: string, specifier: string): string {
  const segments = dirname(importerPath)
    .split('/')
    .filter((segment) => segment.length > 0);
  for (const part of specifier.split('/')) {
    if (part === '' || part === '.') {
      continue;
    }
    if (part === '..') {
      segments.pop();
      continue;
    }
    segments.push(part);
  }
  return segments.join('/');
}
