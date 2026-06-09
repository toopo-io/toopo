import type { Descriptor, Edge, Node, SymbolId } from '@toopo/core';
import type { ExtractContext } from '@toopo/parser';
import type { Node as SyntaxNode } from 'web-tree-sitter';
import type { SymbolSubKind } from '../subkinds.js';
import { classifyDeclaration } from './declarations.js';
import { parseEdge } from './edges.js';
import type { Heritage } from './heritage.js';
import { type DeclaredChild, extractParameters } from './params.js';
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
      properties: {},
    });
    edges.push(parseEdge('contains', ctx.fileId, id, 'react/contains-symbol'));

    const declared = extractParameters(
      ctx,
      declaration.params,
      descriptor,
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
  }

  return { nodes, edges, symbols };
}
