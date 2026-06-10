import type { JsonObject } from '@toopo/core';
import type { Node as SyntaxNode } from 'web-tree-sitter';

/**
 * Builders for the open `properties` bag (ADR-0015 §5): the language-owned,
 * JSON-safe structural detail that rides on a symbol node without any core
 * change — types, default values, optional/rest flags, return types,
 * async/generator, member modifiers, and JSDoc. Each builder returns a fresh
 * object whose keys appear in a fixed order, so the serialized bag is byte-stable
 * (determinism); an absent field is simply omitted, so a symbol with no extra
 * detail keeps an empty `{}` bag.
 */

const DOC_ANCESTORS: ReadonlySet<string> = new Set([
  'lexical_declaration',
  'variable_declaration',
  'export_statement',
]);

/** The inner type source of a `: T` annotation (the colon and spacing dropped). */
export function typeText(annotation: SyntaxNode | null): string | undefined {
  if (annotation === null) {
    return undefined;
  }
  const inner = annotation.namedChildren.find((child) => child !== null) ?? null;
  return inner === null ? undefined : inner.text;
}

/** A `/** … *\/` JSDoc block immediately preceding a declaration, or undefined. */
export function jsdoc(node: SyntaxNode): string | undefined {
  let anchor = node;
  while (anchor.parent !== null && DOC_ANCESTORS.has(anchor.parent.type)) {
    anchor = anchor.parent;
  }
  const previous = anchor.previousSibling;
  if (previous === null || previous.type !== 'comment' || !previous.text.startsWith('/**')) {
    return undefined;
  }
  return previous.text;
}

/**
 * Structural detail for a callable. `callable` is the function-like node that
 * owns the signature (a `function_declaration`, an `arrow_function` value, or a
 * `method_definition`); `declaration` is the node that owns the modifiers and
 * anchors the JSDoc (the same node for a method, the declarator for an arrow).
 */
export function callableDetail(callable: SyntaxNode, declaration: SyntaxNode): JsonObject {
  const returnType = typeText(callable.childForFieldName('return_type'));
  return {
    ...(hasToken(callable, 'async') ? { async: true } : {}),
    ...(isGenerator(callable) ? { generator: true } : {}),
    ...(returnType === undefined ? {} : { returnType }),
    ...modifiers(declaration),
    ...jsdocField(declaration),
  };
}

/** Structural detail for a class field or interface property. */
export function fieldDetail(node: SyntaxNode): JsonObject {
  const type = typeText(node.childForFieldName('type'));
  const value = node.childForFieldName('value');
  return {
    ...(type === undefined ? {} : { type }),
    ...(hasToken(node, '?') ? { optional: true } : {}),
    ...(value === null ? {} : { default: value.text }),
    ...modifiers(node),
    ...jsdocField(node),
  };
}

/** Detail for one declared parameter / destructured field. */
export function paramDetail(input: {
  readonly type?: string | undefined;
  readonly optional?: boolean | undefined;
  readonly rest?: boolean | undefined;
  readonly defaultValue?: string | undefined;
}): JsonObject {
  return {
    ...(input.type === undefined ? {} : { type: input.type }),
    ...(input.optional === true ? { optional: true } : {}),
    ...(input.rest === true ? { rest: true } : {}),
    ...(input.defaultValue === undefined ? {} : { default: input.defaultValue }),
  };
}

/** JSDoc (+ any caller-supplied extra) detail — classes, interfaces, types, vars. */
export function declarationDetail(node: SyntaxNode, extra?: JsonObject): JsonObject {
  return { ...extra, ...jsdocField(node) };
}

function isGenerator(callable: SyntaxNode): boolean {
  return callable.type.startsWith('generator_function') || hasToken(callable, '*');
}

/** Class-member modifiers: visibility, static, readonly, abstract. */
function modifiers(node: SyntaxNode): JsonObject {
  const visibility = node.children.find(
    (child) => child !== null && child.type === 'accessibility_modifier',
  );
  return {
    ...(visibility === undefined || visibility === null ? {} : { visibility: visibility.text }),
    ...(hasToken(node, 'static') ? { static: true } : {}),
    ...(hasToken(node, 'readonly') ? { readonly: true } : {}),
    ...(hasToken(node, 'abstract') || node.type === 'abstract_method_signature'
      ? { abstract: true }
      : {}),
  };
}

function jsdocField(node: SyntaxNode): JsonObject {
  const doc = jsdoc(node);
  return doc === undefined ? {} : { jsdoc: doc };
}

/** Whether a node has a direct anonymous keyword token of the given type. */
function hasToken(node: SyntaxNode, type: string): boolean {
  return node.children.some((child) => child !== null && !child.isNamed && child.type === type);
}
