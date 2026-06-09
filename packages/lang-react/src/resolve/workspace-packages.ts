import type { SubpathExport, WorkspacePackage } from '@toopo/resolver';

/**
 * A workspace package as read from disk by the caller (IO stays out of this pure
 * module). `dir` is the package's repo-relative POSIX directory; the `package.json`
 * entry fields are optional fallbacks for locating its source entry; `exports`
 * is the raw `exports` map, for resolving published subpaths (Fix C2).
 *
 * NOTE (F-D): this is TS/JS-ecosystem configuration logic, currently the only
 * TS-based language. When a second TS-based `lang-*` plugin lands, lift this and
 * {@link buildAliasTable} into a shared `lang-ts-shared` module rather than
 * duplicating them — they are not React-specific.
 */
export interface WorkspacePackageInput {
  readonly name: string;
  readonly dir: string;
  readonly main?: string;
  readonly module?: string;
  readonly types?: string;
  readonly exports?: Record<string, unknown>;
}

/**
 * Map workspace packages to the resolver's model (ADR-0016 Fork 2b, Fix C2).
 * Both the main `entry` and each published subpath MUST resolve to a parseable
 * SOURCE file in the analyzed set — the resolver looks them up exactly and
 * follows their export chains — NOT the built `dist` artifact `package.json`
 * names. Sources are chosen from ordered candidates (the `src/index.ts`
 * convention, then a built-path-derived source), keeping only the first that
 * exists per the injected `fileExists` probe. A package contributes only its
 * resolvable entry and subpaths; anything unresolvable is dropped rather than
 * guessed (the trust principle), and a package with neither is omitted.
 *
 * Subpath `exports` support is for EXACT subpaths (`./components/button`).
 * Wildcard subpaths (`./components/*`) need the full file list to enumerate and
 * are deferred here (honestly omitted) — no Toopo package uses them.
 */
export function buildWorkspacePackages(
  inputs: readonly WorkspacePackageInput[],
  fileExists: (repoRelativePath: string) => boolean,
): WorkspacePackage[] {
  const packages: WorkspacePackage[] = [];
  for (const input of inputs) {
    const entry = candidateEntries(input).find(fileExists);
    const subpathExports = buildSubpathExports(input, fileExists);
    if (entry !== undefined) {
      packages.push({
        name: input.name,
        entry,
        ...(subpathExports.length > 0 && { subpathExports }),
      });
    } else if (subpathExports.length > 0) {
      packages.push({ name: input.name, subpathExports });
    }
  }
  return packages;
}

/** Resolve a package's `exports` map to its EXACT published subpath sources. */
function buildSubpathExports(
  input: WorkspacePackageInput,
  fileExists: (repoRelativePath: string) => boolean,
): SubpathExport[] {
  const subpaths: SubpathExport[] = [];
  for (const [key, target] of Object.entries(input.exports ?? {})) {
    if (key === '.' || key.includes('*')) {
      continue; // '.' is the main entry; '*' wildcards are deferred (need the file list)
    }
    const subpath = key.replace(/^\.\//, '');
    const builtTarget = pickSourceTarget(target);
    const entry =
      builtTarget === undefined ? undefined : sourceEntry(input.dir, builtTarget, fileExists);
    if (entry !== undefined) {
      subpaths.push({ subpath, entry });
    }
  }
  return subpaths;
}

/** Pick a source-mappable target from an exports entry (string or condition object). */
function pickSourceTarget(target: unknown): string | undefined {
  if (typeof target === 'string') {
    return target;
  }
  if (typeof target === 'object' && target !== null) {
    const conditions = target as Record<string, unknown>;
    for (const key of ['import', 'default', 'types']) {
      const value = conditions[key];
      if (typeof value === 'string') {
        return value;
      }
    }
  }
  return undefined;
}

/** The existing source file backing a built exports target, or undefined. */
function sourceEntry(
  dir: string,
  target: string,
  fileExists: (repoRelativePath: string) => boolean,
): string | undefined {
  if (!/\.(d\.ts|tsx?|jsx?|mjs|cjs|mts|cts)$/.test(target)) {
    return undefined; // a non-source target (.css, .json, …) backs no symbol
  }
  const stem = target
    .replace(/^\.\//, '')
    .replace(/(^|\/)dist\//, '$1src/')
    .replace(/\.(d\.ts|tsx?|jsx?|mjs|cjs|mts|cts)$/, '');
  const base = `${dir}/${stem}`;
  return [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find(fileExists);
}

/** Ordered repo-relative source-entry candidates for a workspace package. */
function candidateEntries(input: WorkspacePackageInput): string[] {
  const candidates = [
    `${input.dir}/src/index.ts`,
    `${input.dir}/src/index.tsx`,
    `${input.dir}/index.ts`,
    `${input.dir}/index.tsx`,
  ];
  for (const field of [input.module, input.main, input.types]) {
    const derived = sourceFromBuilt(input.dir, field);
    if (derived !== undefined) {
      candidates.push(derived);
    }
  }
  return candidates;
}

/**
 * Derive a likely source path from a built `package.json` entry field: drop a
 * leading `./`, rewrite a `dist/` segment to `src/`, and a built extension to
 * its TypeScript source extension. Returns undefined when there is no field.
 */
function sourceFromBuilt(dir: string, field: string | undefined): string | undefined {
  if (field === undefined) {
    return undefined;
  }
  const normalized = field.replace(/^\.\//, '').replace(/(^|\/)dist\//, '$1src/');
  const sourced = normalized
    .replace(/\.d\.ts$/, '.ts')
    .replace(/\.jsx$/, '.tsx')
    .replace(/\.js$/, '.ts');
  return `${dir}/${sourced}`;
}
