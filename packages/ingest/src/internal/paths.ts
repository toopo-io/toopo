/**
 * Directory names never traversed during discovery (F-B hard defaults). Shared
 * by the walker and the workspace scanner so neither descends into build output
 * or dependency trees.
 */
export const HARD_DEFAULT_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage']);

/** Normalize a crawled path to forward slashes (fdir yields the OS separator). */
export function toPosix(path: string): string {
  return path.replaceAll('\\', '/');
}

/** The repo-relative POSIX directory of a path ('' for a root-level entry). */
export function directoryOf(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash);
}
