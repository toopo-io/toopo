import type { Descriptor, Edge, Node, SymbolId } from '@toopo/core';
import type { ExtractContext } from '@toopo/parser';
import type { Node as SyntaxNode } from 'web-tree-sitter';
import { SUBKIND, type SymbolSubKind } from '../subkinds.js';
import { classifySymbol } from './classify.js';
import { callableDetail, declarationDetail, paramDetail, typeText } from './detail.js';
import { parseEdge } from './edges.js';
import { bodyReturnsJsx } from './jsx-body.js';
import { extractParameters } from './params.js';
import { destructuredBindings } from './patterns.js';
import type { ExtractedSymbol } from './symbols.js';

/**
 * The in-body bindings extracted from one function/method scope (ADR-0027):
 * nested named functions and local variables become `local` child symbols,
 * recursively. Callable locals are returned as {@link ExtractedSymbol}s (marked
 * `memberOf` the enclosing scope) so a call inside one attributes to it, while
 * staying out of bare-name target resolution (a local never satisfies a callee
 * it cannot be proven to bind — trust principle).
 */
export interface LocalExtraction {
  readonly nodes: Node[];
  readonly edges: Edge[];
  readonly symbols: ExtractedSymbol[];
}

const FUNCTION_VALUE_TYPES: ReadonlySet<string> = new Set([
  'arrow_function',
  'function_expression',
]);

/** A binding discovered in a scope, before its id (and any shadow disambiguator) is minted. */
interface RawLocal {
  readonly name: string;
  readonly nameNode: SyntaxNode;
  readonly subKind: SymbolSubKind;
  readonly properties: Node['properties'];
  /** The function node whose body opens a new scope, for a callable local. */
  readonly fnNode: SyntaxNode | null;
}

/** Extract every in-body local of one function/method scope, recursively. */
export function extractLocals(
  ctx: ExtractContext,
  body: SyntaxNode,
  enclosingDescriptors: readonly Descriptor[],
  enclosingSymbolId: SymbolId,
  jsx: boolean,
): LocalExtraction {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const symbols: ExtractedSymbol[] = [];
  walkScope(ctx, body, enclosingDescriptors, enclosingSymbolId, jsx, { nodes, edges, symbols });
  return { nodes, edges, symbols };
}

function walkScope(
  ctx: ExtractContext,
  body: SyntaxNode,
  descriptors: readonly Descriptor[],
  scopeSymbolId: SymbolId,
  jsx: boolean,
  out: LocalExtraction,
): void {
  const raw = collectScopeBindings(ctx, body, jsx);
  const shadowed = nameCounts(raw);
  const occurrences = new Map<string, number>();

  for (const local of raw) {
    const occurrence = nextOccurrence(occurrences, local.name);
    const descriptor: Descriptor =
      (shadowed.get(local.name) ?? 0) > 1
        ? { name: local.name, suffix: 'local', disambiguator: String(occurrence) }
        : { name: local.name, suffix: 'local' };
    const id = ctx.childId([...descriptors, descriptor]);

    out.nodes.push({
      kind: 'symbol',
      id,
      name: local.name,
      subKind: local.subKind,
      location: ctx.locate(local.nameNode),
      properties: local.properties,
    });
    out.edges.push(parseEdge('contains', scopeSymbolId, id, 'react/declares-local'));

    if (local.fnNode !== null) {
      const childDescriptors = [...descriptors, descriptor];
      const params = extractParameters(
        ctx,
        local.fnNode.childForFieldName('parameters'),
        childDescriptors,
        id,
        false,
      );
      out.nodes.push(...params.nodes);
      out.edges.push(...params.edges);
      out.symbols.push({
        id,
        name: local.name,
        node: local.fnNode,
        subKind: local.subKind,
        declared: params.children,
        heritage: { extends: [], implements: [] },
        memberOf: scopeSymbolId,
      });
      const childBody = local.fnNode.childForFieldName('body');
      if (childBody !== null) {
        walkScope(ctx, childBody, childDescriptors, id, jsx, out);
      }
    }
  }
}

/**
 * The direct bindings of a scope, in source order — descending through nested
 * blocks (if/for/while/try) but never crossing into a nested function scope
 * (that scope's own bindings are captured when it is recursed into). Anonymous
 * inline functions introduce no named binding, so they anchor no locals.
 */
function collectScopeBindings(
  ctx: ExtractContext,
  scopeBody: SyntaxNode,
  jsx: boolean,
): RawLocal[] {
  const bindings: RawLocal[] = [];
  const visit = (node: SyntaxNode): void => {
    for (const child of node.namedChildren) {
      if (child === null) {
        continue;
      }
      switch (child.type) {
        case 'function_declaration':
        case 'generator_function_declaration':
          bindings.push(...namedFunction(ctx, child, jsx));
          break;
        case 'lexical_declaration':
        case 'variable_declaration':
          bindings.push(...declaration(ctx, child, jsx));
          break;
        case 'arrow_function':
        case 'function_expression':
        case 'class_declaration':
        case 'abstract_class_declaration':
        case 'method_definition':
          break; // a new (here anonymous/unsupported) scope — anchors no scope-local binding
        default:
          visit(child);
      }
    }
  };
  visit(scopeBody);
  return bindings;
}

/** A nested `function`/`function*` declaration — a callable local opening a scope. */
function namedFunction(ctx: ExtractContext, node: SyntaxNode, jsx: boolean): RawLocal[] {
  const nameNode = node.childForFieldName('name');
  if (nameNode === null || nameNode.type !== 'identifier') {
    return [];
  }
  const subKind = classifySymbol(
    nameNode.text,
    jsx && bodyReturnsJsx(ctx, node.childForFieldName('body')),
  );
  return [
    {
      name: nameNode.text,
      nameNode,
      subKind,
      properties: callableDetail(node, node),
      fnNode: node,
    },
  ];
}

/** The bindings of a `const`/`let`/`var` declaration: plain, callable, or destructured. */
function declaration(ctx: ExtractContext, node: SyntaxNode, jsx: boolean): RawLocal[] {
  const out: RawLocal[] = [];
  for (const declarator of node.namedChildren) {
    if (declarator === null || declarator.type !== 'variable_declarator') {
      continue;
    }
    const nameNode = declarator.childForFieldName('name');
    if (nameNode === null) {
      continue;
    }
    if (nameNode.type === 'identifier') {
      out.push(identifierBinding(ctx, declarator, nameNode, jsx));
    } else if (nameNode.type === 'object_pattern' || nameNode.type === 'array_pattern') {
      for (const binding of destructuredBindings(nameNode)) {
        out.push({
          name: binding.name,
          nameNode: binding.node,
          subKind: SUBKIND.variable,
          properties: paramDetail({ rest: binding.rest, defaultValue: binding.defaultValue }),
          fnNode: null,
        });
      }
    }
  }
  return out;
}

/** A named local: a callable when its value is a function, otherwise a variable. */
function identifierBinding(
  ctx: ExtractContext,
  declarator: SyntaxNode,
  nameNode: SyntaxNode,
  jsx: boolean,
): RawLocal {
  const value = declarator.childForFieldName('value');
  if (value !== null && FUNCTION_VALUE_TYPES.has(value.type)) {
    const subKind = classifySymbol(
      nameNode.text,
      jsx && bodyReturnsJsx(ctx, value.childForFieldName('body')),
    );
    return {
      name: nameNode.text,
      nameNode,
      subKind,
      properties: callableDetail(value, declarator),
      fnNode: value,
    };
  }
  const type = typeText(declarator.childForFieldName('type'));
  return {
    name: nameNode.text,
    nameNode,
    subKind: SUBKIND.variable,
    properties: declarationDetail(declarator, type === undefined ? undefined : { type }),
    fnNode: null,
  };
}

function nextOccurrence(occurrences: Map<string, number>, name: string): number {
  const occurrence = occurrences.get(name) ?? 0;
  occurrences.set(name, occurrence + 1);
  return occurrence;
}

function nameCounts(raw: readonly RawLocal[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const local of raw) {
    counts.set(local.name, (counts.get(local.name) ?? 0) + 1);
  }
  return counts;
}
