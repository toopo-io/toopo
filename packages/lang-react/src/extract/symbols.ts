import type { Descriptor, Edge, Node, SymbolId } from '@toopo/core';
import type { ExtractContext } from '@toopo/parser';
import type { Node as SyntaxNode } from 'web-tree-sitter';
import { SUBKIND, type SymbolSubKind } from '../subkinds.js';
import { classifySymbol } from './classify.js';
import { parseEdge } from './edges.js';
import { type DeclaredChild, extractParameters } from './params.js';
import { JSX_QUERY, SYMBOL_QUERY } from './queries.js';

/** A top-level symbol the file declares, kept for the call/render passes. */
export interface ExtractedSymbol {
  readonly id: SymbolId;
  readonly name: string;
  /** The symbol-defining syntax node, used to attribute call-sites by ancestry. */
  readonly node: SyntaxNode;
  readonly subKind: SymbolSubKind;
  /** Declared params/props, for binding call/render payloads to receivers. */
  readonly declared: DeclaredChild[];
}

export interface SymbolExtraction {
  readonly nodes: Node[];
  readonly edges: Edge[];
  readonly symbols: ExtractedSymbol[];
}

const JSX_BODY_TYPES = new Set(['jsx_element', 'jsx_self_closing_element']);

/**
 * Extract the file's top-level component/hook/function symbols plus their
 * declared params/props (ADR-0015 §6), each linked by `contains`. Anonymous
 * declarations (no name node) are skipped — a symbol's identity is its name
 * path, and inventing one would be a guess.
 */
export function extractSymbols(ctx: ExtractContext): SymbolExtraction {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const symbols: ExtractedSymbol[] = [];

  for (const capture of ctx.query(SYMBOL_QUERY).captures(ctx.tree.rootNode)) {
    const definition = capture.node;
    const parts = functionParts(definition);
    if (parts.name === null) {
      continue;
    }

    const name = parts.name.text;
    const subKind = classifySymbol(name, bodyReturnsJsx(ctx, parts.body));
    const descriptor: Descriptor = { name, suffix: 'term' };
    const id = ctx.childId([descriptor]);

    nodes.push({
      kind: 'symbol',
      id,
      name,
      subKind,
      location: ctx.locate(definition),
      properties: {},
    });
    edges.push(parseEdge('contains', ctx.fileId, id, 'react/contains-symbol'));

    const declared = extractParameters(
      ctx,
      parts.params,
      descriptor,
      id,
      subKind === SUBKIND.component,
    );
    nodes.push(...declared.nodes);
    edges.push(...declared.edges);

    symbols.push({ id, name, node: definition, subKind, declared: declared.children });
  }

  return { nodes, edges, symbols };
}

interface FunctionParts {
  readonly name: SyntaxNode | null;
  readonly params: SyntaxNode | null;
  readonly body: SyntaxNode | null;
}

/** Resolve the name/parameters/body of a function declaration or arrow/fn const. */
function functionParts(definition: SyntaxNode): FunctionParts {
  if (definition.type === 'variable_declarator') {
    const value = definition.childForFieldName('value');
    return {
      name: definition.childForFieldName('name'),
      params: value?.childForFieldName('parameters') ?? null,
      body: value?.childForFieldName('body') ?? null,
    };
  }
  return {
    name: definition.childForFieldName('name'),
    params: definition.childForFieldName('parameters'),
    body: definition.childForFieldName('body'),
  };
}

/**
 * Whether a function body returns JSX. An arrow body that IS a JSX node counts
 * directly; otherwise any JSX descendant of the body counts. This is a
 * documented heuristic: it can see JSX created inside a nested callback, but
 * combined with the Capitalized-name gate it classifies the subKind only and
 * never an edge, so a false positive is recoverable.
 */
function bodyReturnsJsx(ctx: ExtractContext, body: SyntaxNode | null): boolean {
  if (body === null) {
    return false;
  }
  if (JSX_BODY_TYPES.has(body.type)) {
    return true;
  }
  return ctx.query(JSX_QUERY).captures(body).length > 0;
}
