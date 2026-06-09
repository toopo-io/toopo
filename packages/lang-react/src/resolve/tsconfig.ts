import type { AliasRule } from '@toopo/resolver';

/**
 * The tsconfig `compilerOptions` fields relevant to module resolution. Callers
 * read and parse the tsconfig file themselves and pass the already-parsed
 * content here — this builder is PURE and touches no filesystem, preserving the
 * Resolve pass's determinism and fs-free guarantee (ADR-0016).
 */
export interface TsconfigCompilerOptions {
  readonly baseUrl?: string;
  readonly paths?: Readonly<Record<string, readonly string[]>>;
}

/**
 * Build the alias table the resolver's `ProjectModel` carries from a tsconfig's
 * `baseUrl` + `paths` (ADR-0016 Fork 2). Targets are resolved to repo-relative
 * paths here — joined through `tsconfigDir` and `baseUrl` — so the resolver only
 * ever sees repo-relative candidates and never needs the original config layout.
 * The `*` capture is preserved verbatim in each target for the resolver to
 * substitute at match time.
 */
export function buildAliasTable(
  compilerOptions: TsconfigCompilerOptions,
  tsconfigDir: string,
): AliasRule[] {
  const baseDir = joinRepoPath(tsconfigDir, compilerOptions.baseUrl ?? '.');
  const rules: AliasRule[] = [];
  for (const [pattern, targets] of Object.entries(compilerOptions.paths ?? {})) {
    rules.push({ pattern, targets: targets.map((target) => joinRepoPath(baseDir, target)) });
  }
  return rules;
}

/**
 * Join two repo-relative path fragments into a normalized, forward-slash path,
 * resolving `.`/`..` and preserving a trailing `*` capture. Pure string work —
 * never the filesystem.
 */
function joinRepoPath(base: string, relative: string): string {
  const segments: string[] = [];
  const parts = `${base}/${relative}`.replaceAll('\\', '/').split('/');
  for (const part of parts) {
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
