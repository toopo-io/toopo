import ignore, { type Ignore } from 'ignore';

/**
 * A `.gitignore` file found in the tree: its containing directory as a
 * repo-relative POSIX path (`''` for the repo root) mapped to its raw content.
 */
export type GitignoreSources = ReadonlyMap<string, string>;

/**
 * Build a PURE predicate deciding whether a repo-relative POSIX path is ignored,
 * given every `.gitignore` in the tree (gitignore-aware, root + nested).
 * The IO — finding and reading those files — happens in the discovery walker;
 * this function is filesystem-free so the precedence logic is unit-testable.
 *
 * Git semantics are honored across the nesting: for a path, each `.gitignore`
 * on its ancestor chain is consulted from the repo root downward, and the
 * deepest matching rule wins — so a nested `!re-included` file overrides a
 * parent's exclusion, matching git's "last match in the hierarchy" rule.
 */
export function buildIgnoreFilter(sources: GitignoreSources): (path: string) => boolean {
  const matchers = new Map<string, Ignore>();
  for (const [dir, content] of sources) {
    matchers.set(dir, ignore().add(content));
  }
  const dirsRootFirst = [...matchers.keys()].sort(byDepthThenName);

  return (path: string): boolean => {
    let ignored = false;
    for (const dir of dirsRootFirst) {
      if (!appliesTo(dir, path)) {
        continue;
      }
      const relative = dir === '' ? path : path.slice(dir.length + 1);
      const verdict = matchers.get(dir)?.test(relative);
      if (verdict?.ignored) {
        ignored = true;
      } else if (verdict?.unignored) {
        ignored = false;
      }
    }
    return ignored;
  };
}

/** Whether a `.gitignore` in `dir` governs `path` (the root, or an ancestor of it). */
function appliesTo(dir: string, path: string): boolean {
  return dir === '' || path.startsWith(`${dir}/`);
}

/** Order directories shallowest-first so deeper `.gitignore` rules win (git
 *  precedence). Keys are unique, so the same-depth tiebreak is two-way. */
function byDepthThenName(a: string, b: string): number {
  const depth = segmentCount(a) - segmentCount(b);
  if (depth !== 0) {
    return depth;
  }
  return a < b ? -1 : 1;
}

function segmentCount(dir: string): number {
  return dir === '' ? 0 : dir.split('/').length;
}
