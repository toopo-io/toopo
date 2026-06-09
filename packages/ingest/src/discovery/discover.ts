import { readFile } from 'node:fs/promises';
import { fdir } from 'fdir';
import { buildIgnoreFilter, type GitignoreSources } from './ignore-filter.js';

/**
 * Directory names never traversed (F-B hard defaults). Excluding them at the
 * crawl level — rather than filtering afterwards — keeps the walk fast and
 * avoids reading `.gitignore` files buried inside dependency trees.
 */
const HARD_DEFAULT_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage']);

const GITIGNORE = '.gitignore';

export interface DiscoverOptions {
  /**
   * Keep only repo-relative paths this predicate accepts — typically a
   * supported-extension test derived from the injected language plugins. The
   * walker stays language-agnostic; the caller owns what counts as a source file.
   */
  readonly include: (repoRelativePath: string) => boolean;
  /** Honor `.gitignore` files (root + nested). Defaults to true. */
  readonly gitignore?: boolean;
}

/**
 * Discover source files under `rootDir` as repo-relative POSIX paths, in a
 * deterministic lexicographic order (ADR-0016 determinism — a crawler's native
 * order is filesystem-dependent, so ordering is ours to own, not the library's).
 *
 * The hard-default directories are skipped during the walk; remaining files are
 * filtered by `.gitignore` rules (root + nested) and by the caller's `include`
 * predicate. This is the filesystem edge of the pipeline; the parser and
 * resolver downstream stay pure.
 */
export async function discoverFiles(
  rootDir: string,
  options: DiscoverOptions,
): Promise<readonly string[]> {
  const crawled = await new fdir()
    .withRelativePaths()
    .exclude((dirName) => HARD_DEFAULT_DIRS.has(dirName))
    .crawl(rootDir)
    .withPromise();

  const paths = crawled.map(toPosix);
  const isIgnored =
    options.gitignore === false
      ? () => false
      : buildIgnoreFilter(await readGitignores(rootDir, paths));

  // Paths are unique, so a two-way comparator gives a total deterministic order.
  return paths
    .filter((path) => options.include(path) && !isIgnored(path))
    .sort((a, b) => (a < b ? -1 : 1));
}

/** Read every `.gitignore` in the crawled set, keyed by its directory ('' = root). */
async function readGitignores(
  rootDir: string,
  paths: readonly string[],
): Promise<GitignoreSources> {
  const sources = new Map<string, string>();
  const gitignorePaths = paths.filter(
    (path) => path === GITIGNORE || path.endsWith(`/${GITIGNORE}`),
  );
  await Promise.all(
    gitignorePaths.map(async (path) => {
      const content = await readFile(`${rootDir}/${path}`, 'utf8');
      sources.set(directoryOf(path), content);
    }),
  );
  return sources;
}

/** The repo-relative POSIX directory of a path ('' for a root-level file). */
function directoryOf(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash);
}

/** Normalize a crawled path to forward slashes (fdir yields the OS separator). */
function toPosix(path: string): string {
  return path.replaceAll('\\', '/');
}
