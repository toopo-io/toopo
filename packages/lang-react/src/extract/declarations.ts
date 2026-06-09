import type { ExtractContext } from '@toopo/parser';
import type { Node as SyntaxNode } from 'web-tree-sitter';
import { SUBKIND, type SymbolSubKind } from '../subkinds.js';
import { classifySymbol } from './classify.js';
import { classHeritage, type Heritage } from './heritage.js';
import { JSX_QUERY } from './queries.js';
import { isReactComponentWrapper, wrapperRenderParams } from './react-wrappers.js';

/** What one top-level declaration contributes: its name, subKind, declared
 *  params (function-likes/components), and class supertype names. */
export interface ClassifiedDeclaration {
  readonly name: string;
  readonly subKind: SymbolSubKind;
  readonly params: SyntaxNode | null;
  readonly isComponent: boolean;
  readonly heritage: Heritage;
}

const NO_HERITAGE: Heritage = { extends: [], implements: [] };
const JSX_BODY_TYPES = new Set(['jsx_element', 'jsx_self_closing_element']);

/**
 * Classify a captured top-level declaration into the symbol it declares, or null
 * if it has no stable name (anonymous default, or a destructuring declarator —
 * inventing an identity would be a guess). Dispatches on the probed node type
 * (Fix B); each branch decides the subKind and what params, if any, to extract.
 */
export function classifyDeclaration(
  ctx: ExtractContext,
  def: SyntaxNode,
  jsx: boolean,
): ClassifiedDeclaration | null {
  switch (def.type) {
    case 'function_declaration':
      return fromFunction(ctx, def, jsx);
    case 'variable_declarator':
      return fromVariable(ctx, def, jsx);
    case 'class_declaration':
    case 'abstract_class_declaration':
      return fromNamed(def, SUBKIND.class, classHeritage(def));
    case 'interface_declaration':
      return fromNamed(def, SUBKIND.interface, NO_HERITAGE);
    case 'type_alias_declaration':
      return fromNamed(def, SUBKIND.type, NO_HERITAGE);
    default:
      return null;
  }
}

function fromFunction(
  ctx: ExtractContext,
  def: SyntaxNode,
  jsx: boolean,
): ClassifiedDeclaration | null {
  const name = identifierText(def.childForFieldName('name'));
  if (name === null) {
    return null;
  }
  const body = def.childForFieldName('body');
  const subKind = classifySymbol(name, jsx && bodyReturnsJsx(ctx, body));
  return descriptorOf(name, subKind, def.childForFieldName('parameters'));
}

function fromVariable(
  ctx: ExtractContext,
  def: SyntaxNode,
  jsx: boolean,
): ClassifiedDeclaration | null {
  const name = identifierText(def.childForFieldName('name'));
  if (name === null) {
    return null; // a destructuring pattern has no single stable identity
  }
  const value = def.childForFieldName('value');
  if (value !== null && (value.type === 'arrow_function' || value.type === 'function_expression')) {
    const subKind = classifySymbol(
      name,
      jsx && bodyReturnsJsx(ctx, value.childForFieldName('body')),
    );
    return descriptorOf(name, subKind, value.childForFieldName('parameters'));
  }
  if (isReactComponentWrapper(value)) {
    return descriptorOf(name, SUBKIND.component, wrapperRenderParams(value));
  }
  return {
    name,
    subKind: SUBKIND.variable,
    params: null,
    isComponent: false,
    heritage: NO_HERITAGE,
  };
}

function fromNamed(
  def: SyntaxNode,
  subKind: SymbolSubKind,
  heritage: Heritage,
): ClassifiedDeclaration | null {
  const name = identifierText(def.childForFieldName('name'));
  if (name === null) {
    return null;
  }
  return { name, subKind, params: null, isComponent: false, heritage };
}

/** A function-like descriptor whose params are props iff it is a component. */
function descriptorOf(
  name: string,
  subKind: SymbolSubKind,
  params: SyntaxNode | null,
): ClassifiedDeclaration {
  return {
    name,
    subKind,
    params,
    isComponent: subKind === SUBKIND.component,
    heritage: NO_HERITAGE,
  };
}

/** The text of a plain identifier/type-identifier name node, or null otherwise. */
function identifierText(node: SyntaxNode | null): string | null {
  if (node !== null && (node.type === 'identifier' || node.type === 'type_identifier')) {
    return node.text;
  }
  return null;
}

/**
 * Whether a function body returns JSX (documented heuristic): an arrow body that
 * IS a JSX node counts directly; otherwise any JSX descendant counts. Combined
 * with the Capitalized-name gate it sets the subKind only — never an edge — so a
 * false positive is recoverable.
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
