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
  /** The public name a caller addresses (the destructured key, never the local alias). */
  readonly name: string;
  readonly node: SyntaxNode;
  /** A destructured field (object/array pattern member) vs a plain named parameter. */
  readonly destructured: boolean;
}

/**
 * Extract a symbol's declared interface as child `symbol` nodes (ADR-0015 §6),
 * each linked by a `contains` edge from the parent. A destructured field on a
 * COMPONENT is a `react:prop`; every other declared input is a `ts:parameter`.
 * Ids are minted under the parent's descriptor CHAIN via `ctx.childId`, so a
 * method's params nest correctly beneath their class (e.g. `Widget#render().(x)`)
 * and round-trip through the core codec.
 *
 * Coverage: named identifier params; object-pattern fields — shorthand
 * (`{ label }`), renamed (`{ a: b }` → public name `a`), defaulted (`{ a = 1 }`),
 * and rest (`{ ...others }`); array-pattern element identifiers (`[a, b]`); and
 * top-level rest params (`...rest`). The public destructured KEY is captured, not
 * the local alias — that is the name a caller binds to (trust principle). Names
 * that have no stable public identity (a computed key, a deeply nested element)
 * are skipped rather than fabricated.
 */
export function extractParameters(
  ctx: ExtractContext,
  params: SyntaxNode | null,
  parentDescriptors: readonly Descriptor[],
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
    if (param === null) {
      continue;
    }
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
      const id = ctx.childId([...parentDescriptors, { name: field.name, suffix: 'parameter' }]);
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

/** The declared bindings a parameter pattern introduces, by public name. */
function declaredFields(pattern: SyntaxNode): DeclaredField[] {
  switch (pattern.type) {
    case 'identifier':
      return [{ name: pattern.text, node: pattern, destructured: false }];
    case 'rest_pattern': {
      const inner = pattern.namedChildren.find((child) => child?.type === 'identifier') ?? null;
      return inner === null ? [] : [{ name: inner.text, node: inner, destructured: false }];
    }
    case 'object_pattern':
      return pattern.namedChildren.flatMap(objectPatternField);
    case 'array_pattern':
      return pattern.namedChildren
        .filter((child): child is SyntaxNode => child?.type === 'identifier')
        .map((child) => ({ name: child.text, node: child, destructured: true }));
    default:
      return [];
  }
}

/** One field of an object destructuring pattern, addressed by its public key. */
function objectPatternField(child: SyntaxNode | null): DeclaredField[] {
  if (child === null) {
    return [];
  }
  switch (child.type) {
    case 'shorthand_property_identifier_pattern':
      return [{ name: child.text, node: child, destructured: true }];
    case 'pair_pattern': {
      const key = child.childForFieldName('key');
      return key === null ? [] : [{ name: key.text, node: key, destructured: true }];
    }
    case 'object_assignment_pattern': {
      const left = child.childForFieldName('left');
      return left === null ? [] : [{ name: left.text, node: left, destructured: true }];
    }
    case 'rest_pattern': {
      const inner = child.namedChildren.find((node) => node?.type === 'identifier') ?? null;
      return inner === null ? [] : [{ name: inner.text, node: inner, destructured: true }];
    }
    default:
      return [];
  }
}
