import { Language } from 'web-tree-sitter';
import type { GrammarSource } from '../plugin/language-plugin.js';

/**
 * Load each grammar's `Language` at most once and reuse it across every file
 * (ADR-0016 Fork 2: grammar caching). The in-flight promise is cached so
 * concurrent first-loads share one `Language.load`. A failed load is evicted so
 * a later call can retry rather than re-throwing a stale rejection forever.
 */
const grammars = new Map<string, Promise<Language>>();

export function loadGrammar(grammar: GrammarSource): Promise<Language> {
  const cached = grammars.get(grammar.id);
  if (cached !== undefined) {
    return cached;
  }
  const loading = grammar
    .load()
    .then((bytes) => Language.load(bytes))
    .catch((error: unknown) => {
      grammars.delete(grammar.id);
      throw error;
    });
  grammars.set(grammar.id, loading);
  return loading;
}
