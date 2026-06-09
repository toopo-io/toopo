import { dirname, relative, resolve } from 'node:path';
import { buildAliasTable, type TsconfigCompilerOptions } from '@toopo/lang-react';
import type { AliasRule } from '@toopo/resolver';
import { getTsconfig } from 'get-tsconfig';
import { toPosix } from '../internal/paths.js';

/**
 * Read the project's tsconfig and build the resolver's alias table (ADR-0016
 * Fork 2). `get-tsconfig` resolves `extends` chains and jsonc; the pure
 * `buildAliasTable` (in `lang-react`) turns `baseUrl` + `paths` into
 * repo-relative `AliasRule`s. This is the IO half; the parsing stays pure (F-D).
 *
 * `get-tsconfig` searches upward from `rootDir`, so a tsconfig resolved OUTSIDE
 * the analyzed root is ignored — its aliases would point at files not in the
 * analyzed set. A monorepo with only per-package tsconfigs therefore yields no
 * aliases at the repo root, and cross-package links ride workspace packages
 * instead (the Toopo layout).
 */
export function loadTsconfigAliases(rootDir: string): AliasRule[] {
  const base = resolve(rootDir);
  const found = getTsconfig(base);
  if (found === null) {
    return [];
  }
  const repoRelativeDir = toPosix(relative(base, dirname(found.path)));
  if (repoRelativeDir.startsWith('..')) {
    return [];
  }
  const { baseUrl, paths } = found.config.compilerOptions ?? {};
  // Omit absent keys rather than assigning undefined (exactOptionalPropertyTypes).
  const options: TsconfigCompilerOptions = {
    ...(baseUrl !== undefined && { baseUrl }),
    ...(paths !== undefined && { paths }),
  };
  return buildAliasTable(options, repoRelativeDir);
}
