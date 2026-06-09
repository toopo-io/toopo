import type { Edge, SymbolId } from '@toopo/core';
import type { ExtractContext, LocalExport, ReExport, ReExportBinding } from '@toopo/parser';
import type { Node as SyntaxNode } from 'web-tree-sitter';
import { parseEdge } from './edges.js';
import { EXPORT_QUERY } from './queries.js';
import { moduleSpecifier } from './specifier.js';
import type { ExtractedSymbol } from './symbols.js';

export interface ExportExtraction {
  readonly edges: Edge[];
  readonly exports: LocalExport[];
  readonly reExports: ReExport[];
}

/** A locally-defined export resolved to the symbol it binds, with its export name. */
interface LocalBinding {
  readonly exportedName: string;
  readonly symbolId: SymbolId;
}

/**
 * Map a file's `export` statements (ADR-0016 export resolution), splitting on
 * what is lexically provable at parse time:
 *
 *   - an export WITH a `from` source is a cross-file re-export: a structured
 *     `ReExport` record (named / namespace / star), no fabricated edge — exactly
 *     as a relative import defers to the resolver;
 *   - an export WITHOUT a source binds locally-defined symbols: each becomes a
 *     deterministic `exports` edge (file → symbol) PLUS a `LocalExport` record
 *     carrying the precise exported name (`default`, or a `Foo as Bar` rename),
 *     which an edge cannot encode.
 *
 * Only an export that binds to an extracted top-level symbol is emitted. An
 * export of a type, a class/non-function const, or a re-exported import
 * (`export { X }` where X is imported, not defined here) has no local symbol and
 * is deferred — missing one is recoverable, fabricating a binding is not.
 */
export function extractExports(
  ctx: ExtractContext,
  symbols: readonly ExtractedSymbol[],
): ExportExtraction {
  const edges: Edge[] = [];
  const exports: LocalExport[] = [];
  const reExports: ReExport[] = [];

  const symbolByName = new Map<string, SymbolId>();
  for (const symbol of symbols) {
    symbolByName.set(symbol.name, symbol.id);
  }

  for (const capture of ctx.query(EXPORT_QUERY).captures(ctx.tree.rootNode)) {
    const statement = capture.node;
    const specifier = moduleSpecifier(statement);
    const typeOnly = hasTypeKeyword(statement);

    if (specifier !== null) {
      reExports.push(buildReExport(ctx, statement, specifier, typeOnly));
      continue;
    }

    for (const binding of localBindings(statement, symbolByName)) {
      const isDefault = binding.exportedName === 'default';
      edges.push(
        parseEdge(
          'exports',
          ctx.fileId,
          binding.symbolId,
          isDefault ? 'react/exports-default' : 'react/exports-local',
          isDefault ? 'ts:defaultExport' : undefined,
        ),
      );
      exports.push({
        exporterFileId: ctx.fileId,
        exportedName: binding.exportedName,
        symbolId: binding.symbolId,
        typeOnly,
      });
    }
  }

  return { edges, exports, reExports };
}

/** Resolve the locally-defined exports a source-less `export` statement declares. */
function localBindings(
  statement: SyntaxNode,
  symbolByName: ReadonlyMap<string, SymbolId>,
): LocalBinding[] {
  const isDefault = hasDefaultKeyword(statement);

  const declaration = statement.childForFieldName('declaration');
  if (declaration !== null) {
    return declaredNames(declaration).flatMap((name) =>
      bind(isDefault ? 'default' : name, name, symbolByName),
    );
  }

  const clause = namedChildOfType(statement, 'export_clause');
  if (clause !== null) {
    return clauseBindings(clause, symbolByName);
  }

  // `export default <identifier>` — re-exports a locally-defined symbol as default.
  const value = statement.childForFieldName('value');
  if (isDefault && value !== null && value.type === 'identifier') {
    return bind('default', value.text, symbolByName);
  }
  return [];
}

/** The declared name(s) of an exported declaration (function, or `const`/`let` fns). */
function declaredNames(declaration: SyntaxNode): string[] {
  if (declaration.type === 'function_declaration' || declaration.type === 'class_declaration') {
    const name = declaration.childForFieldName('name');
    return name === null ? [] : [name.text];
  }
  if (declaration.type === 'lexical_declaration' || declaration.type === 'variable_declaration') {
    return declaration.namedChildren
      .filter((child) => child.type === 'variable_declarator')
      .map((declarator) => declarator.childForFieldName('name'))
      .filter((node): node is SyntaxNode => node !== null)
      .map((node) => node.text);
  }
  return [];
}

/** Resolve an `export { local as exported }` clause (no source) to local symbols. */
function clauseBindings(
  clause: SyntaxNode,
  symbolByName: ReadonlyMap<string, SymbolId>,
): LocalBinding[] {
  const bindings: LocalBinding[] = [];
  for (const specifier of clause.namedChildren) {
    if (specifier.type !== 'export_specifier') {
      continue;
    }
    const nameNode = specifier.childForFieldName('name');
    if (nameNode === null) {
      continue;
    }
    const alias = specifier.childForFieldName('alias');
    bindings.push(...bind(alias?.text ?? nameNode.text, nameNode.text, symbolByName));
  }
  return bindings;
}

/** A single binding to a known symbol, or none when the local name is not a symbol. */
function bind(
  exportedName: string,
  localName: string,
  symbolByName: ReadonlyMap<string, SymbolId>,
): LocalBinding[] {
  const symbolId = symbolByName.get(localName);
  return symbolId === undefined ? [] : [{ exportedName, symbolId }];
}

/** Build the structured record for an `export … from './m'` re-export statement. */
function buildReExport(
  ctx: ExtractContext,
  statement: SyntaxNode,
  specifier: string,
  typeOnly: boolean,
): ReExport {
  const base = {
    exporterFileId: ctx.fileId,
    exporterPath: ctx.filePath,
    specifier,
    typeOnly,
  };

  const clause = namedChildOfType(statement, 'export_clause');
  if (clause !== null) {
    return { ...base, kind: 'named', bindings: namedReExportBindings(clause, typeOnly) };
  }

  const namespace = namedChildOfType(statement, 'namespace_export');
  if (namespace !== null) {
    const identifier = namespace.namedChildren.find((child) => child.type === 'identifier');
    const bindings: ReExportBinding[] =
      identifier === undefined ? [] : [{ name: '*', exportedAs: identifier.text, typeOnly }];
    return { ...base, kind: 'namespace', bindings };
  }

  return { ...base, kind: 'star', bindings: [] };
}

/** Map an `export { a, b as c } from './m'` clause to its per-name re-export bindings. */
function namedReExportBindings(clause: SyntaxNode, statementTypeOnly: boolean): ReExportBinding[] {
  const bindings: ReExportBinding[] = [];
  for (const specifier of clause.namedChildren) {
    if (specifier.type !== 'export_specifier') {
      continue;
    }
    const nameNode = specifier.childForFieldName('name');
    if (nameNode === null) {
      continue;
    }
    const alias = specifier.childForFieldName('alias');
    bindings.push({
      name: nameNode.text,
      exportedAs: alias?.text ?? nameNode.text,
      typeOnly: statementTypeOnly || specifier.children.some((child) => child.type === 'type'),
    });
  }
  return bindings;
}

/** Whether a statement carries a top-level `type` keyword (`export type { … }`). */
function hasTypeKeyword(statement: SyntaxNode): boolean {
  return statement.children.some((child) => child.type === 'type');
}

/** Whether an `export` statement is a default export (`export default …`). */
function hasDefaultKeyword(statement: SyntaxNode): boolean {
  return statement.children.some((child) => child.type === 'default');
}

/** The first named child of a given grammar type, or null. */
function namedChildOfType(node: SyntaxNode, type: string): SyntaxNode | null {
  return node.namedChildren.find((child) => child.type === type) ?? null;
}
