import type { Node as SyntaxNode } from 'web-tree-sitter';

/**
 * One binding a destructuring pattern introduces, addressed by its PUBLIC name —
 * the object key, never the local alias (`{ a: b }` → `a`), so the name a caller
 * or the source object exposes is what the graph records (trust principle). Used
 * by both parameter extraction and local-variable extraction (DRY).
 */
export interface PatternBinding {
  readonly name: string;
  readonly node: SyntaxNode;
  readonly rest?: boolean;
  readonly defaultValue?: string | undefined;
}

/**
 * The leaf bindings of an object/array destructuring pattern, by public name.
 * One level deep: shorthand (`{ a }`), renamed (`{ a: b }` → `a`), defaulted
 * (`{ a = 1 }`), rest (`{ ...r }`, `[...r]`), and array element identifiers
 * (`[x, y]`). A deeply nested or computed binding has no stable public name and
 * is skipped rather than fabricated.
 */
export function destructuredBindings(pattern: SyntaxNode): PatternBinding[] {
  if (pattern.type === 'object_pattern') {
    return pattern.namedChildren.flatMap(objectField);
  }
  if (pattern.type === 'array_pattern') {
    return pattern.namedChildren.flatMap(arrayElement);
  }
  return [];
}

function objectField(child: SyntaxNode | null): PatternBinding[] {
  if (child === null) {
    return [];
  }
  switch (child.type) {
    case 'shorthand_property_identifier_pattern':
      return [{ name: child.text, node: child }];
    case 'pair_pattern': {
      const key = child.childForFieldName('key');
      // Only a plain identifier key has a stable public name; a computed (`[expr]`),
      // string, or numeric key has none and is skipped, never fabricated as a
      // symbol named `[expr]`/`"s"` (trust principle; mirrors classifyMember).
      return key === null || key.type !== 'property_identifier'
        ? []
        : [{ name: key.text, node: key }];
    }
    case 'object_assignment_pattern': {
      const left = child.childForFieldName('left');
      return left === null
        ? []
        : [{ name: left.text, node: left, defaultValue: child.childForFieldName('right')?.text }];
    }
    case 'rest_pattern':
      return restBinding(child);
    default:
      return [];
  }
}

function arrayElement(child: SyntaxNode | null): PatternBinding[] {
  if (child === null) {
    return [];
  }
  if (child.type === 'identifier') {
    return [{ name: child.text, node: child }];
  }
  if (child.type === 'rest_pattern') {
    return restBinding(child);
  }
  return [];
}

function restBinding(rest: SyntaxNode): PatternBinding[] {
  const inner = rest.namedChildren.find((node) => node?.type === 'identifier') ?? null;
  return inner === null ? [] : [{ name: inner.text, node: inner, rest: true }];
}
