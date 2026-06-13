/**
 * ASCII Unit Separator (U+001F, `\x1F`). tree-sitter emits no control character
 * in identifier text, so this byte never occurs inside a SymbolId — which makes
 * it a safe, unambiguous delimiter for joining SymbolIds into a composite string
 * (a `(source, target)` pair key, or a visited-path token list). Defined once so
 * the guarantee has a single source rather than a raw literal per call site.
 */
export const UNIT_SEPARATOR = String.fromCharCode(31);
