import type { JsonObject } from '@toopo/core';
import type { ExtractContext } from '@toopo/parser';
import type { Node as SyntaxNode } from 'web-tree-sitter';
import { SUBKIND, type SymbolSubKind } from '../subkinds.js';
import { classifySymbol } from './classify.js';
import { callableDetail, declarationDetail, typeText } from './detail.js';
import { classHeritage, type Heritage } from './heritage.js';
import { bodyReturnsJsx } from './jsx-body.js';
import { isReactComponentWrapper, wrapperRenderParams } from './react-wrappers.js';

/** What one top-level declaration contributes: its name, subKind, declared
 *  params (function-likes/components), class supertype names, and the structural
 *  `properties` detail (types, modifiers, async, JSDoc…) carried on its node. */
export interface ClassifiedDeclaration {
  readonly name: string;
  readonly subKind: SymbolSubKind;
  readonly params: SyntaxNode | null;
  readonly isComponent: boolean;
  readonly heritage: Heritage;
  readonly properties: JsonObject;
  /** The function-like body to scan for in-scope locals (ADR-0027), or null. */
  readonly bodyNode: SyntaxNode | null;
}

const NO_HERITAGE: Heritage = { extends: [], implements: [] };
/** Base classes that make a class a React component (high-signal, subKind only). */
const REACT_COMPONENT_BASES: ReadonlySet<string> = new Set([
  'Component',
  'PureComponent',
  'React.Component',
  'React.PureComponent',
]);

/**
 * Classify a captured top-level declaration into the symbol it declares, or null
 * if it has no stable name (anonymous default, or a destructuring declarator —
 * inventing an identity would be a guess). Dispatches on the probed node type;
 * each branch decides the subKind, what params (if any) to extract, and the
 * structural detail to attach.
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
      return fromClass(def);
    case 'interface_declaration':
      return fromNamed(def, SUBKIND.interface, NO_HERITAGE, declarationDetail(def));
    case 'type_alias_declaration':
      return fromNamed(def, SUBKIND.type, NO_HERITAGE, declarationDetail(def));
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
  return descriptorOf(
    name,
    subKind,
    def.childForFieldName('parameters'),
    callableDetail(def, def),
    body,
  );
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
    return descriptorOf(
      name,
      subKind,
      value.childForFieldName('parameters'),
      callableDetail(value, def),
      value.childForFieldName('body'),
    );
  }
  if (isReactComponentWrapper(value)) {
    return descriptorOf(
      name,
      SUBKIND.component,
      wrapperRenderParams(value),
      declarationDetail(def),
      null,
    );
  }
  const type = typeText(def.childForFieldName('type'));
  return {
    name,
    subKind: SUBKIND.variable,
    params: null,
    isComponent: false,
    heritage: NO_HERITAGE,
    properties: declarationDetail(def, type === undefined ? undefined : { type }),
    bodyNode: null,
  };
}

/** A class is a `react:component` when it extends a React component base. */
function fromClass(def: SyntaxNode): ClassifiedDeclaration | null {
  const heritage = classHeritage(def);
  const isComponent = heritage.extends.some((base) => REACT_COMPONENT_BASES.has(base));
  const subKind = isComponent ? SUBKIND.component : SUBKIND.class;
  const abstract = def.type === 'abstract_class_declaration' ? { abstract: true } : undefined;
  return fromNamed(def, subKind, heritage, declarationDetail(def, abstract));
}

function fromNamed(
  def: SyntaxNode,
  subKind: SymbolSubKind,
  heritage: Heritage,
  properties: JsonObject,
): ClassifiedDeclaration | null {
  const name = identifierText(def.childForFieldName('name'));
  if (name === null) {
    return null;
  }
  return { name, subKind, params: null, isComponent: false, heritage, properties, bodyNode: null };
}

/** A function-like descriptor whose params are props iff it is a component. */
function descriptorOf(
  name: string,
  subKind: SymbolSubKind,
  params: SyntaxNode | null,
  properties: JsonObject,
  bodyNode: SyntaxNode | null,
): ClassifiedDeclaration {
  return {
    name,
    subKind,
    params,
    isComponent: subKind === SUBKIND.component,
    heritage: NO_HERITAGE,
    properties,
    bodyNode,
  };
}

/** The text of a plain identifier/type-identifier name node, or null otherwise. */
function identifierText(node: SyntaxNode | null): string | null {
  if (node !== null && (node.type === 'identifier' || node.type === 'type_identifier')) {
    return node.text;
  }
  return null;
}
