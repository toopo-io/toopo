import type { WorkspacePackage } from '@toopo/resolver';

/**
 * A workspace package as read from disk by the caller (IO stays out of this pure
 * module). `dir` is the package's repo-relative POSIX directory; the `package.json`
 * entry fields are optional fallbacks for locating its source entry.
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
}

/**
 * Map workspace packages to the resolver's `{ name, entry }` model (ADR-0016
 * Fork 2b). The `entry` MUST be a parseable SOURCE file in the analyzed set —
 * the resolver looks it up exactly and follows its export chain — NOT the built
 * `dist` artifact that `package.json` "main" usually names. So each package's
 * source entry is chosen from ordered candidates (the `src/index.ts` convention
 * first, then a `main`-derived source path), keeping only the first that exists
 * per the injected `fileExists` probe. A package with no parseable source entry
 * is dropped: a bare import of it stays honestly external rather than resolving
 * to a guess (the trust principle).
 */
export function buildWorkspacePackages(
  inputs: readonly WorkspacePackageInput[],
  fileExists: (repoRelativePath: string) => boolean,
): WorkspacePackage[] {
  const packages: WorkspacePackage[] = [];
  for (const input of inputs) {
    const entry = candidateEntries(input).find(fileExists);
    if (entry !== undefined) {
      packages.push({ name: input.name, entry });
    }
  }
  return packages;
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
