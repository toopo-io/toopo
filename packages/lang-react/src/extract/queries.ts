/**
 * Tree-sitter query sources for the React/TS slice. They are verified against
 * the vendored `tsx` grammar's node types (probed, not guessed). The parser
 * compiles and caches them; this module is the single place the grammar's
 * surface is named, so a grammar bump touches exactly one file.
 */

/**
 * TOP-LEVEL declarations (ADR-0015 grain: file-contained symbols), captured at
 * file scope or under a top-level `export_statement`. The set covers what real
 * code exports and other files import (Fix B):
 *
 *   - `function_declaration` — functions, components, hooks;
 *   - `variable_declarator` — ANY value const/let/var: arrow/function values are
 *     functions/components/hooks, a `forwardRef`/`memo` wrapper is a component,
 *     and every other value is a `ts:variable` (the kind is decided in code);
 *   - `class_declaration` / `abstract_class_declaration` — `ts:class`;
 *   - `interface_declaration` — `ts:interface`;
 *   - `type_alias_declaration` — `ts:type`.
 *
 * Nested declarations and class/interface MEMBERS are deliberately deferred. The
 * `declaration:` field excludes anonymous `export default (…) =>` / `export
 * default function() {}` (no name → no stable identity), which degrade to "no
 * symbol" rather than a fabricated one.
 */
export const SYMBOL_QUERY = `
  (program (function_declaration) @symbol)
  (program (export_statement declaration: (function_declaration) @symbol))
  (program (lexical_declaration (variable_declarator) @symbol))
  (program (variable_declaration (variable_declarator) @symbol))
  (program (export_statement declaration: (lexical_declaration (variable_declarator) @symbol)))
  (program (export_statement declaration: (variable_declaration (variable_declarator) @symbol)))
  (program (class_declaration) @symbol)
  (program (abstract_class_declaration) @symbol)
  (program (export_statement declaration: (class_declaration) @symbol))
  (program (export_statement declaration: (abstract_class_declaration) @symbol))
  (program (interface_declaration) @symbol)
  (program (export_statement declaration: (interface_declaration) @symbol))
  (program (type_alias_declaration) @symbol)
  (program (export_statement declaration: (type_alias_declaration) @symbol))
`;

/**
 * Any JSX node — used to decide whether a Capitalized symbol is a component.
 * In this grammar a `<>…</>` fragment is itself a `jsx_element` (with an empty
 * opening tag), so the two element kinds cover fragments too.
 */
export const JSX_QUERY = '[(jsx_element) (jsx_self_closing_element)] @jsx';

/** Every import statement; its clause and source are inspected in code. */
export const IMPORT_QUERY = '(import_statement) @import';

/**
 * Every export statement; its declaration, clause, default keyword, and source
 * are inspected in code (ADR-0016 export resolution). A statement WITH a source
 * is a cross-file re-export (handed to the resolver as a structured record); a
 * statement WITHOUT a source exports locally-defined symbols (an `exports` edge
 * plus a record carrying the exported name).
 */
export const EXPORT_QUERY = '(export_statement) @export';

/**
 * Every call expression. The callee form (identifier vs member-expression vs
 * other) is inspected in code: identifier and dotted member callees become
 * call-sites; a member callee keeps its full path (e.g. `a.b`) so the resolver
 * can correlate it, but gets no fabricated target edge.
 */
export const CALL_QUERY = '(call_expression) @call';

/**
 * Every JSX element's invocation point — the self-closing element or the opening
 * tag of an element-with-children. The name (identifier vs member) and its
 * casing are inspected in code: a lowercase identifier is an intrinsic host
 * element (never a render); a Capitalized identifier is a component; a dotted
 * member name is always a component (handled by the member pass).
 */
export const JSX_ELEMENT_QUERY = `
  (jsx_self_closing_element) @element
  (jsx_opening_element) @element
`;
