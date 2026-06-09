import { formatSymbolId, type SymbolId, type SymbolIdentity } from '@toopo/core';

/**
 * Normalize a repo-relative path to forward-slash segments: tolerate Windows
 * separators and a leading `./` or `/` so the same file yields the same
 * identity on every platform (ADR-0016 determinism).
 */
function normalizeRepoPath(path: string): string {
  return path.replaceAll('\\', '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

/**
 * Derive a file's stable identity (ADR-0015 §4) from its repo-relative path:
 * each path segment becomes a `namespace` descriptor, so the file is a stable
 * container for the symbols it declares. The path is the identity source — never
 * line/column — and the descriptor codec escapes segments like `Button.tsx`.
 */
export function fileIdentity(path: string): SymbolIdentity {
  const segments = normalizeRepoPath(path)
    .split('/')
    .filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    throw new Error(`Cannot derive a file identity from an empty path: "${path}"`);
  }
  return {
    descriptors: segments.map((name) => ({ name, suffix: 'namespace' as const })),
  };
}

/** The encoded, canonical file id — the storage key for the file node. */
export function fileSymbolId(path: string): SymbolId {
  return formatSymbolId(fileIdentity(path));
}
