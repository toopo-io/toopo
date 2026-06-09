import {
  type AliasRule,
  type ModuleIndex,
  type ModuleRequest,
  type ModuleResolution,
  type ProjectModel,
  resolveRelative,
} from '@toopo/resolver';
import { isAlias, isRelative, packageName } from '../specifier-kind.js';

/**
 * TypeScript file-extension probe order, pinned from the TS Handbook (Module
 * Resolution): TypeScript-source and declaration files are tried before their
 * JavaScript equivalents, so resolution always prefers a file that carries type
 * information. The `.mts`/`.cts` variants are a later refinement.
 */
const FILE_EXTENSIONS = ['.ts', '.tsx', '.d.ts', '.js', '.jsx'] as const;

const DETERMINISTIC = { resolution: 'deterministic' } as const;

/**
 * Resolve a module specifier (ADR-0016 Fork 2). A RELATIVE specifier is probed
 * against the project's parsed file universe in TypeScript's order. An ALIAS
 * specifier (`@/x`) is resolved through the tsconfig `paths` table carried in the
 * `ProjectModel` — config-driven, hence deterministic when it resolves; the
 * table is supplied by the caller, never read from disk (the fs-free guarantee).
 * A BARE specifier is an external package coordinate (workspace reclassification
 * is a later slice). Nothing is fabricated — no match is honestly unresolved.
 */
export function resolveModule(
  request: ModuleRequest,
  index: ModuleIndex,
  project: ProjectModel,
): ModuleResolution {
  if (isRelative(request.specifier)) {
    return (
      probe(resolveRelative(request.importerPath, request.specifier), index) ?? {
        status: 'unresolved',
        reason: `No parsed file matches "${request.specifier}" from "${request.importerPath}".`,
      }
    );
  }
  if (isAlias(request.specifier)) {
    return resolveAlias(request.specifier, project.aliases, index);
  }
  return {
    status: 'external',
    coordinate: { manager: 'npm', name: packageName(request.specifier) },
  };
}

/** Resolve an alias specifier through the longest-matching tsconfig path rule. */
function resolveAlias(
  specifier: string,
  aliases: readonly AliasRule[],
  index: ModuleIndex,
): ModuleResolution {
  for (const base of aliasBases(specifier, aliases)) {
    const resolved = probe(base, index);
    if (resolved !== null) {
      return resolved;
    }
  }
  return { status: 'unresolved', reason: `Alias "${specifier}" matched no parsed file.` };
}

/** Probe a base path through the TS candidate order, or null if none exists. */
function probe(base: string, index: ModuleIndex): ModuleResolution | null {
  for (const candidate of candidatePaths(base)) {
    const fileId = index.fileId(candidate);
    if (fileId !== undefined) {
      return { status: 'internal', fileId, certainty: DETERMINISTIC };
    }
  }
  return null;
}

/** The substituted base paths for the longest tsconfig `paths` rule that matches. */
function aliasBases(specifier: string, aliases: readonly AliasRule[]): string[] {
  let best: AliasRule | null = null;
  let bestPrefix = -1;
  let captured = '';
  for (const rule of aliases) {
    const match = matchPattern(rule.pattern, specifier);
    if (match !== null && match.prefixLength > bestPrefix) {
      best = rule;
      bestPrefix = match.prefixLength;
      captured = match.captured;
    }
  }
  if (best === null) {
    return [];
  }
  return best.targets.map((target) =>
    target.includes('*') ? target.replace('*', captured) : target,
  );
}

/** Match a tsconfig path pattern (`@/*`, `@app`) and capture its `*` segment. */
function matchPattern(
  pattern: string,
  specifier: string,
): { prefixLength: number; captured: string } | null {
  const star = pattern.indexOf('*');
  if (star === -1) {
    return pattern === specifier ? { prefixLength: pattern.length, captured: '' } : null;
  }
  const prefix = pattern.slice(0, star);
  const suffix = pattern.slice(star + 1);
  if (
    !specifier.startsWith(prefix) ||
    !specifier.endsWith(suffix) ||
    specifier.length < prefix.length + suffix.length
  ) {
    return null;
  }
  return {
    prefixLength: prefix.length,
    captured: specifier.slice(prefix.length, specifier.length - suffix.length),
  };
}

/** The ordered candidate paths for a base path: literal, extension, then index. */
function candidatePaths(base: string): string[] {
  return [
    base,
    ...FILE_EXTENSIONS.map((extension) => `${base}${extension}`),
    ...FILE_EXTENSIONS.map((extension) => `${base}/index${extension}`),
  ];
}
