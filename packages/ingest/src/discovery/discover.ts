import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fdir } from 'fdir';
import { directoryOf, HARD_DEFAULT_DIRS, toPosix } from '../internal/paths.js';
import { buildIgnoreFilter, type GitignoreSources } from './ignore-filter.js';

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
  // fdir's withRelativePaths() collapses to basenames when the crawl root is a
  // bare relative path (e.g. "."); resolving to absolute keeps full subpaths.
  const base = resolve(rootDir);
  // excludeSymlinks: analysed repo content is untrusted (security baseline) and
  // the reads downstream FOLLOW links — a hostile repo could symlink a file
  // outside the sandbox and have its target ingested into the graph. Excluding
  // symlinks at discovery makes the walk provably confined to the real tree.
  const crawled = await new fdir({ excludeSymlinks: true })
    .withRelativePaths()
    .exclude((dirName) => HARD_DEFAULT_DIRS.has(dirName))
    .crawl(base)
    .withPromise();

  const paths = crawled.map(toPosix);
  const isIgnored =
    options.gitignore === false
      ? () => false
      : buildIgnoreFilter(await readGitignores(base, paths));

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
