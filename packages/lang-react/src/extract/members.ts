import type { Descriptor, Edge, Node, SymbolId } from '@toopo/core';
import type { ExtractContext } from '@toopo/parser';
import type { Node as SyntaxNode } from 'web-tree-sitter';
import { SUBKIND, type SymbolSubKind } from '../subkinds.js';
import { parseEdge } from './edges.js';
import { extractParameters } from './params.js';
import type { ExtractedSymbol } from './symbols.js';

/**
 * The members extracted from one class or interface body (ADR-0015 §6): each
 * method/accessor/field/property as a child `symbol` node linked by a `contains`
 * edge, plus the method-like members returned as {@link ExtractedSymbol}s so a
 * call-site inside a method attributes to that method rather than the class.
 */
export interface MemberExtraction {
  readonly nodes: Node[];
  readonly edges: Edge[];
  readonly symbols: ExtractedSymbol[];
}

const EMPTY: MemberExtraction = { nodes: [], edges: [], symbols: [] };
const NO_HERITAGE = { extends: [], implements: [] } as const;

/** The member roles we capture; each maps to a subKind and an identity descriptor. */
type MemberRole = 'method' | 'getter' | 'setter' | 'field' | 'property';

interface RawMember {
  readonly node: SyntaxNode;
  readonly nameNode: SyntaxNode;
  readonly name: string;
  readonly role: MemberRole;
}

const SUBKIND_BY_ROLE: Readonly<Record<MemberRole, SymbolSubKind>> = {
  method: SUBKIND.method,
  getter: SUBKIND.getter,
  setter: SUBKIND.setter,
  field: SUBKIND.field,
  property: SUBKIND.property,
};

const RULE_BY_ROLE: Readonly<Record<MemberRole, string>> = {
  method: 'react/declares-method',
  getter: 'react/declares-accessor',
  setter: 'react/declares-accessor',
  field: 'react/declares-field',
  property: 'react/declares-property',
};

/**
 * Extract the members declared by a class or interface. Methods, accessors,
 * fields, and interface properties become child symbols under the container's
 * descriptor; a method's own parameters nest one level deeper. Members with no
 * stable public name (a computed `[expr]` key) are skipped rather than given a
 * fabricated identity (trust principle).
 */
export function extractMembers(
  ctx: ExtractContext,
  definition: SyntaxNode,
  parentDescriptor: Descriptor,
  parentSymbolId: SymbolId,
): MemberExtraction {
  const body = definition.childForFieldName('body');
  if (body === null || (body.type !== 'class_body' && body.type !== 'interface_body')) {
    return EMPTY;
  }

  const raw = body.namedChildren
    .map(classifyMember)
    .filter((member): member is RawMember => member !== null);
  const disambiguators = methodDisambiguators(raw);

  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const symbols: ExtractedSymbol[] = [];

  const occurrences = new Map<string, number>();
  for (const member of raw) {
    const occurrence = nextOccurrence(occurrences, member.name);
    const disambiguator = isMethodLike(member.role)
      ? memberDisambiguator(member, disambiguators, occurrence)
      : undefined;
    const descriptor = memberDescriptor(member, disambiguator);
    const id = ctx.childId([parentDescriptor, descriptor]);

    nodes.push({
      kind: 'symbol',
      id,
      name: member.name,
      subKind: SUBKIND_BY_ROLE[member.role],
      location: ctx.locate(member.node),
      properties: {},
    });
    edges.push(parseEdge('contains', parentSymbolId, id, RULE_BY_ROLE[member.role]));

    if (isMethodLike(member.role)) {
      const params = extractParameters(
        ctx,
        member.node.childForFieldName('parameters'),
        [parentDescriptor, descriptor],
        id,
        false,
      );
      nodes.push(...params.nodes);
      edges.push(...params.edges);
      symbols.push({
        id,
        name: member.name,
        node: member.node,
        subKind: SUBKIND_BY_ROLE[member.role],
        declared: params.children,
        heritage: NO_HERITAGE,
        memberOf: parentSymbolId,
      });
    }
  }

  return { nodes, edges, symbols };
}

const METHOD_LIKE: ReadonlySet<MemberRole> = new Set(['method', 'getter', 'setter']);
const isMethodLike = (role: MemberRole): boolean => METHOD_LIKE.has(role);

/** Map one body child to a captured member, or null for unnamed/unsupported members. */
function classifyMember(node: SyntaxNode | null): RawMember | null {
  if (node === null) {
    return null;
  }
  const role = roleOf(node);
  if (role === null) {
    return null;
  }
  const nameNode = node.childForFieldName('name');
  if (nameNode === null || nameNode.type !== 'property_identifier') {
    return null; // computed/string keys have no stable public identity
  }
  return { node, nameNode, name: nameNode.text, role };
}

function roleOf(node: SyntaxNode): MemberRole | null {
  switch (node.type) {
    case 'method_definition':
      return accessorRole(node) ?? 'method';
    case 'abstract_method_signature':
    case 'method_signature':
      return 'method';
    case 'public_field_definition':
      return 'field';
    case 'property_signature':
      return 'property';
    default:
      return null;
  }
}

/** A `get`/`set` accessor surfaces as a leading anonymous `get`/`set` token. */
function accessorRole(node: SyntaxNode): MemberRole | null {
  for (const child of node.children) {
    if (child === null) {
      break;
    }
    if (child.type === 'get') {
      return 'getter';
    }
    if (child.type === 'set') {
      return 'setter';
    }
    if (child.isNamed) {
      break; // the modifier prefix is exhausted once a named node (the name) starts
    }
  }
  return null;
}

/** The id descriptor for a member: a `method` descriptor for callables, else `term`. */
function memberDescriptor(member: RawMember, disambiguator: string | undefined): Descriptor {
  if (isMethodLike(member.role)) {
    return disambiguator === undefined
      ? { name: member.name, suffix: 'method' }
      : { name: member.name, suffix: 'method', disambiguator };
  }
  return { name: member.name, suffix: 'term' };
}

/**
 * The disambiguator for one method-like member. Accessors are split by their
 * semantic kind (`get`/`set`) — edit-stable. Plain methods that share a name
 * (overload signatures) are split by occurrence order, the SCIP-consistent
 * choice; a uniquely-named method gets none, keeping the common id stable.
 */
function memberDisambiguator(
  member: RawMember,
  counts: ReadonlyMap<string, number>,
  occurrence: number,
): string | undefined {
  if (member.role === 'getter') {
    return 'get';
  }
  if (member.role === 'setter') {
    return 'set';
  }
  return (counts.get(member.name) ?? 0) > 1 ? String(occurrence) : undefined;
}

/** Take and advance the per-name occurrence counter (drives overload disambiguation). */
function nextOccurrence(occurrences: Map<string, number>, name: string): number {
  const occurrence = occurrences.get(name) ?? 0;
  occurrences.set(name, occurrence + 1);
  return occurrence;
}

/** Count plain-method names across the container, to detect overload collisions. */
function methodDisambiguators(raw: readonly RawMember[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const member of raw) {
    if (member.role === 'method') {
      counts.set(member.name, (counts.get(member.name) ?? 0) + 1);
    }
  }
  return counts;
}
