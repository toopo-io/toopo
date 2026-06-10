import type { Descriptor, Edge, Node, SymbolId } from '@toopo/core';
import type { ExtractContext } from '@toopo/parser';
import type { Node as SyntaxNode } from 'web-tree-sitter';
import { SUBKIND, type SymbolSubKind } from '../subkinds.js';
import { classifyDeclaration } from './declarations.js';
import { paramDetail } from './detail.js';
import { parseEdge } from './edges.js';
import type { Heritage } from './heritage.js';
import { extractLocals } from './locals.js';
import { extractMembers } from './members.js';
import { type DeclaredChild, extractParameters } from './params.js';
import { destructuredBindings } from './patterns.js';
import { SYMBOL_QUERY } from './queries.js';

/** A top-level symbol the file declares, kept for the call/render/heritage passes. */
export interface ExtractedSymbol {
  readonly id: SymbolId;
  readonly name: string;
  /** The symbol-defining syntax node, used to attribute call-sites by ancestry. */
  readonly node: SyntaxNode;
  readonly subKind: SymbolSubKind;
  /** Declared params/props, for binding call/render payloads to receivers. */
  readonly declared: DeclaredChild[];
  /** Class supertype names (extends/implements), for the heritage-edge pass. */
  readonly heritage: Heritage;
  /**
   * Set on a class/interface MEMBER (its owning container's id). A member can
   * enclose call-sites but is never addressable by a bare in-file callee — so
   * the invocation pass attributes calls to it yet excludes it from name-based
   * target resolution (a method `render` must never satisfy a bare `render()`).
   */
  readonly memberOf?: SymbolId;
}

export interface SymbolExtraction {
  readonly nodes: Node[];
  readonly edges: Edge[];
  readonly symbols: ExtractedSymbol[];
}

/**
 * Extract the file's top-level symbols — functions, components, hooks, value
 * variables, classes, interfaces, and type aliases (ADR-0015 §6, Fix B) — plus
 * the declared params/props of function-likes, each linked by `contains`. The
 * per-kind classification lives in `classifyDeclaration`; declarations with no
 * stable name (anonymous default, destructuring) are skipped rather than given
 * a fabricated identity.
 */
export function extractSymbols(ctx: ExtractContext, jsx: boolean): SymbolExtraction {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const symbols: ExtractedSymbol[] = [];

  for (const capture of ctx.query(SYMBOL_QUERY).captures(ctx.tree.rootNode)) {
    const definition = capture.node;
    const declaration = classifyDeclaration(ctx, definition, jsx);
    if (declaration === null) {
      const destructured = moduleDestructuredSymbols(ctx, definition);
      nodes.push(...destructured.nodes);
      edges.push(...destructured.edges);
      continue;
    }

    const descriptor: Descriptor = { name: declaration.name, suffix: 'term' };
    const id = ctx.childId([descriptor]);

    nodes.push({
      kind: 'symbol',
      id,
      name: declaration.name,
      subKind: declaration.subKind,
      location: ctx.locate(definition),
      properties: declaration.properties,
    });
    edges.push(parseEdge('contains', ctx.fileId, id, 'react/contains-symbol'));

    const declared = extractParameters(
      ctx,
      declaration.params,
      [descriptor],
      id,
      declaration.isComponent,
    );
    nodes.push(...declared.nodes);
    edges.push(...declared.edges);

    symbols.push({
      id,
      name: declaration.name,
      node: definition,
      subKind: declaration.subKind,
      declared: declared.children,
      heritage: declaration.heritage,
    });

    if (declaration.bodyNode !== null) {
      const locals = extractLocals(ctx, declaration.bodyNode, [descriptor], id, jsx);
      nodes.push(...locals.nodes);
      edges.push(...locals.edges);
      symbols.push(...locals.symbols);
    }

    if (isContainerDeclaration(definition)) {
      const members = extractMembers(ctx, definition, descriptor, id, jsx);
      nodes.push(...members.nodes);
      edges.push(...members.edges);
      symbols.push(...members.symbols);
    }
  }

  return { nodes, edges, symbols };
}

/**
 * Module-level destructured bindings (`const { a, b } = x`, `const [x] = y`) the
 * classifier skips for lacking a single name. Each binding is a top-level symbol
 * with a unique public name, so it keeps the `term` suffix (ADR-0027) — no local
 * scope, no disambiguation.
 */
function moduleDestructuredSymbols(
  ctx: ExtractContext,
  definition: SyntaxNode,
): { readonly nodes: Node[]; readonly edges: Edge[] } {
  if (definition.type !== 'variable_declarator') {
    return { nodes: [], edges: [] };
  }
  const pattern = definition.childForFieldName('name');
  if (pattern === null || (pattern.type !== 'object_pattern' && pattern.type !== 'array_pattern')) {
    return { nodes: [], edges: [] };
  }
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  for (const binding of destructuredBindings(pattern)) {
    const id = ctx.childId([{ name: binding.name, suffix: 'term' }]);
    nodes.push({
      kind: 'symbol',
      id,
      name: binding.name,
      subKind: SUBKIND.variable,
      location: ctx.locate(binding.node),
      properties: paramDetail({ rest: binding.rest, defaultValue: binding.defaultValue }),
    });
    edges.push(parseEdge('contains', ctx.fileId, id, 'react/contains-symbol'));
  }
  return { nodes, edges };
}

const CONTAINER_TYPES: ReadonlySet<string> = new Set([
  'class_declaration',
  'abstract_class_declaration',
  'interface_declaration',
]);

/** A class/interface declaration owns members — independent of its subKind (a
 *  React class component is a `react:component` yet still declares members). */
function isContainerDeclaration(definition: SyntaxNode): boolean {
  return CONTAINER_TYPES.has(definition.type);
}
