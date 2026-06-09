import { type Language, Query } from 'web-tree-sitter';

/**
 * Compile each tree-sitter query once and reuse it (ADR-0016 Fork 2: query
 * caching). Compilation is non-trivial and queries are reused across every file
 * of a language, so they are keyed by grammar id plus query source, joined by a
 * NUL that cannot occur in either part — keeping the key unambiguous.
 */
const queries = new Map<string, Query>();

const KEY_SEPARATOR = '\u0000';

export function compileQuery(grammarId: string, language: Language, source: string): Query {
  const key = `${grammarId}${KEY_SEPARATOR}${source}`;
  const cached = queries.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const compiled = new Query(language, source);
  queries.set(key, compiled);
  return compiled;
}
