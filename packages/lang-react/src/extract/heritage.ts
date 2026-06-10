import type { Node as SyntaxNode } from 'web-tree-sitter';

/** The supertype names a class declares (Fix B): `extends` base + `implements` list. */
export interface Heritage {
  readonly extends: readonly string[];
  readonly implements: readonly string[];
}

const EMPTY: Heritage = { extends: [], implements: [] };

/**
 * Extract the base-type NAMES from a class's heritage clauses (probed node
 * types: `class_heritage` → `extends_clause` / `implements_clause`). Only the
 * referenced names are taken; binding them to a symbol (local or imported) is
 * the caller's job, exactly like a call-site callee — the parser fabricates no
 * edge for a name it cannot see. Generic arguments are dropped (`Base<T>` →
 * `Base`) so the name correlates with the imported/declared identifier.
 */
export function classHeritage(classNode: SyntaxNode): Heritage {
  const heritage =
    classNode.childForFieldName('class_heritage') ?? findChild(classNode, 'class_heritage');
  if (heritage === null) {
    return EMPTY;
  }
  return {
    extends: clauseNames(findChild(heritage, 'extends_clause')),
    implements: clauseNames(findChild(heritage, 'implements_clause')),
  };
}

/** The base names of one heritage clause (identifiers / generic-type heads). */
function clauseNames(clause: SyntaxNode | null): string[] {
  if (clause === null) {
    return [];
  }
  const names: string[] = [];
  for (let i = 0; i < clause.namedChildCount; i += 1) {
    const name = baseTypeName(clause.namedChild(i));
    if (name !== null) {
      names.push(name);
    }
  }
  return names;
}

/**
 * The name of a (possibly generic) supertype reference, or null. A plain
 * identifier/type-identifier yields its text; a dotted reference
 * (`React.Component`, `ns.Mixin`) yields the full dotted text so a qualified
 * base (e.g. a React class component's base) is recognizable — binding it to a
 * symbol stays the caller's job, and an unbindable dotted name simply gets no
 * heritage edge (trust principle). Generic arguments are dropped (`Base<T>` →
 * `Base`).
 */
function baseTypeName(node: SyntaxNode | null): string | null {
  if (node === null) {
    return null;
  }
  if (node.type === 'identifier' || node.type === 'type_identifier') {
    return node.text;
  }
  if (node.type === 'member_expression' || node.type === 'nested_type_identifier') {
    return node.text;
  }
  if (node.type === 'generic_type') {
    return baseTypeName(node.childForFieldName('name'));
  }
  return null;
}

/** First direct named child of a given type, or null. */
function findChild(node: SyntaxNode, type: string): SyntaxNode | null {
  for (let i = 0; i < node.namedChildCount; i += 1) {
    const child = node.namedChild(i);
    if (child !== null && child.type === type) {
      return child;
    }
  }
  return null;
}
