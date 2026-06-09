import type { Descriptor, Edge, Node, SymbolId } from '@toopo/core';
import type { ExtractContext } from '@toopo/parser';
import type { Node as SyntaxNode } from 'web-tree-sitter';
import { SUBKIND } from '../subkinds.js';
import { parseEdge } from './edges.js';

/**
 * A symbol's declared input, kept for payload→receiver binding (Phase E/F).
 * `ordinal` is the PARAMETER SLOT index (which argument position), so a simple
 * identifier param at slot i is bindable to positional argument i. All fields of
 * one destructured param share that slot, so they are NOT positionally
 * bindable (an argument binds the whole object, not a field) — props bind by
 * NAME instead.
 */
export interface DeclaredChild {
  readonly id: SymbolId;
  readonly name: string;
  readonly ordinal: number;
  readonly kind: 'prop' | 'param';
}

export interface ParameterExtraction {
  readonly nodes: Node[];
  readonly edges: Edge[];
  readonly children: DeclaredChild[];
}

interface DeclaredField {
  readonly name: string;
  readonly node: SyntaxNode;
  /** A destructured object field (a candidate prop) vs a plain named parameter. */
  readonly destructured: boolean;
}

/**
 * Extract a symbol's declared interface as child `symbol` nodes (ADR-0015 §6),
 * each linked by a `contains` edge from the parent. A destructured object-
 * pattern field on a COMPONENT is a `react:prop`; every other declared input is
 * a `ts:parameter`. Ids are minted under the parent via `ctx.childId`, so they
 * round-trip through the core codec.
 *
 * v1 covers named identifier parameters and shorthand object-pattern fields
 * (`{ label }`) — the dominant React shape. Renamed/defaulted props
 * (`{ a: b }`, `{ a = 1 }`), rest, and array patterns are deferred; missing a
 * declared prop is recoverable, fabricating one is not.
 */
export function extractParameters(
  ctx: ExtractContext,
  params: SyntaxNode | null,
  parentDescriptor: Descriptor,
  parentSymbolId: SymbolId,
  isComponent: boolean,
): ParameterExtraction {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const children: DeclaredChild[] = [];
  if (params === null) {
    return { nodes, edges, children };
  }

  let slot = 0;
  for (const param of params.namedChildren) {
    if (param.type !== 'required_parameter' && param.type !== 'optional_parameter') {
      continue;
    }
    const pattern = param.childForFieldName('pattern');
    if (pattern === null) {
      continue;
    }
    for (const field of declaredFields(pattern)) {
      const isProp = field.destructured && isComponent;
      const subKind = isProp ? SUBKIND.prop : SUBKIND.parameter;
      const id = ctx.childId([parentDescriptor, { name: field.name, suffix: 'parameter' }]);
      nodes.push({
        kind: 'symbol',
        id,
        name: field.name,
        subKind,
        location: ctx.locate(field.node),
        properties: {},
      });
      edges.push(
        parseEdge(
          'contains',
          parentSymbolId,
          id,
          isProp ? 'react/declares-prop' : 'react/declares-parameter',
        ),
      );
      children.push({ id, name: field.name, ordinal: slot, kind: isProp ? 'prop' : 'param' });
    }
    slot += 1;
  }

  return { nodes, edges, children };
}

function declaredFields(pattern: SyntaxNode): DeclaredField[] {
  if (pattern.type === 'identifier') {
    return [{ name: pattern.text, node: pattern, destructured: false }];
  }
  if (pattern.type === 'object_pattern') {
    return pattern.namedChildren
      .filter((child) => child.type === 'shorthand_property_identifier_pattern')
      .map((child) => ({ name: child.text, node: child, destructured: true }));
  }
  return [];
}
