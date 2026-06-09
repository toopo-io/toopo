import { type Edge, formatSymbolId, type SymbolId } from '@toopo/core';
import type { ExtractContext, ImportedBinding, UnresolvedImport } from '@toopo/parser';
import type { Node as SyntaxNode } from 'web-tree-sitter';
import { isAlias, isRelative, packageName } from '../specifier-kind.js';
import { parseEdge } from './edges.js';
import { IMPORT_QUERY } from './queries.js';
import { moduleSpecifier } from './specifier.js';

export interface ImportExtraction {
  readonly edges: Edge[];
  readonly unresolved: UnresolvedImport[];
  /** Local binding name → external symbol id, for the call pass to resolve calls. */
  readonly externalBindings: Map<string, SymbolId>;
}

/**
 * Map a file's `import` statements (ADR-0016 Fork 4), splitting on what is
 * lexically provable at parse time:
 *
 *   - a BARE (external) specifier is resolvable now: each named/default binding
 *     becomes a `deterministic` `imports` edge to an external symbol identified
 *     by its npm package coordinate (`manager:'npm'`, name) plus the exported
 *     name — never the package VERSION (ADR-0015 Fork 1);
 *   - a RELATIVE or path-alias specifier needs the cross-file Resolve pass, so
 *     it is carried as a structured `UnresolvedImport` (with importer context
 *     and the per-binding/whole-statement `type`-only flags) — no fabricated
 *     edge.
 *
 * External namespace (`import * as ns`) and side-effect external imports declare
 * no specific symbol and are deferred (no module-identity convention in v1).
 */
export function extractImports(ctx: ExtractContext): ImportExtraction {
  const edges: Edge[] = [];
  const unresolved: UnresolvedImport[] = [];
  const externalBindings = new Map<string, SymbolId>();

  for (const capture of ctx.query(IMPORT_QUERY).captures(ctx.tree.rootNode)) {
    const statement = capture.node;
    const specifier = moduleSpecifier(statement);
    if (specifier === null) {
      continue;
    }
    const typeOnly = statement.children.some((child) => child.type === 'type');
    const clause = statement.namedChildren.find((child) => child.type === 'import_clause') ?? null;
    const bindings = clause === null ? [] : collectBindings(clause, typeOnly);

    if (isRelative(specifier) || isAlias(specifier)) {
      unresolved.push({
        importerFileId: ctx.fileId,
        importerPath: ctx.filePath,
        specifier,
        imported: bindings,
        typeOnly,
        location: ctx.locate(statement),
      });
      continue;
    }

    const packageCoordinate = { manager: 'npm', name: packageName(specifier) };
    for (const binding of bindings) {
      if (binding.kind === 'namespace') {
        continue; // deferred: no module-identity convention in v1
      }
      const targetId = formatSymbolId({
        package: packageCoordinate,
        descriptors: [{ name: binding.name, suffix: 'term' }],
      });
      edges.push(parseEdge('imports', ctx.fileId, targetId, 'react/import-external'));
      externalBindings.set(binding.localName, targetId);
    }
  }

  return { edges, unresolved, externalBindings };
}

/** Collect every binding an import clause introduces (default, namespace, named). */
function collectBindings(clause: SyntaxNode, statementTypeOnly: boolean): ImportedBinding[] {
  const bindings: ImportedBinding[] = [];
  for (const child of clause.namedChildren) {
    if (child.type === 'identifier') {
      bindings.push({
        name: 'default',
        localName: child.text,
        kind: 'default',
        typeOnly: statementTypeOnly,
      });
      continue;
    }
    if (child.type === 'namespace_import') {
      const identifier = child.namedChildren.find((node) => node.type === 'identifier');
      if (identifier !== undefined) {
        bindings.push({
          name: '*',
          localName: identifier.text,
          kind: 'namespace',
          typeOnly: statementTypeOnly,
        });
      }
      continue;
    }
    if (child.type === 'named_imports') {
      for (const specifier of child.namedChildren) {
        if (specifier.type !== 'import_specifier') {
          continue;
        }
        const nameNode = specifier.childForFieldName('name');
        if (nameNode === null) {
          continue;
        }
        const alias = specifier.childForFieldName('alias');
        const specifierTypeOnly =
          statementTypeOnly || specifier.children.some((c) => c.type === 'type');
        bindings.push({
          name: nameNode.text,
          localName: alias?.text ?? nameNode.text,
          kind: 'named',
          typeOnly: specifierTypeOnly,
        });
      }
    }
  }
  return bindings;
}
