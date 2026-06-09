import type { FileRef, LanguagePlugin } from './language-plugin.js';

/**
 * Resolve which plugin handles a file. First match wins, so resolution is a
 * deterministic function of the injected plugin order. `undefined` means no
 * plugin applies — the caller degrades to `unsupported-language` (ADR-0016
 * graceful degradation), never a failure.
 */
export function resolvePlugin(
  plugins: readonly LanguagePlugin[],
  file: FileRef,
): LanguagePlugin | undefined {
  return plugins.find((plugin) => plugin.matches(file));
}
