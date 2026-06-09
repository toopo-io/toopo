import { SUBKIND, type SymbolSubKind } from '../subkinds.js';

/** React hook naming convention: `use` followed by an upper-case letter or digit. */
const HOOK_NAME = /^use[A-Z0-9]/;
/** Component naming convention: an initial upper-case letter. */
const COMPONENT_NAME = /^[A-Z]/;

/**
 * Classify a function-like symbol's subKind from its NAME and whether its body
 * returns JSX (ADR-0016 Fork 6). This sets the subKind ONLY — never an edge —
 * and stays conservative (trust principle):
 *
 *   - a `use`-prefixed name is a `react:hook` (the React rule, by convention);
 *   - a Capitalized name whose body contains JSX is a `react:component`;
 *   - everything else, including every ambiguous case (Capitalized but no JSX,
 *     JSX but not Capitalized), is the more general `ts:function`.
 *
 * A misclassified subKind is recoverable; a fabricated edge is not — so when in
 * doubt this returns `ts:function` rather than guessing a React role.
 */
export function classifySymbol(name: string, returnsJsx: boolean): SymbolSubKind {
  if (HOOK_NAME.test(name)) {
    return SUBKIND.hook;
  }
  if (COMPONENT_NAME.test(name) && returnsJsx) {
    return SUBKIND.component;
  }
  return SUBKIND.function;
}
