import type { CallSitePayloadArgument } from '@toopo/core';
import type { ExtractContext } from '@toopo/parser';
import type { Node as SyntaxNode } from 'web-tree-sitter';
import type { Invocation } from './invocations.js';
import { namedArg, spreadArg } from './payload.js';
import { JSX_ELEMENT_QUERY } from './queries.js';

/**
 * Collect JSX component elements as render invocations (Fork 1/3/4). A JSX
 * element is a component invocation when its name is a Capitalized identifier,
 * OR any dotted member name (`<Form.Item/>`, `<motion.div/>` — a dotted tag is
 * always a component per JSX semantics, regardless of casing). A lowercase
 * identifier is an intrinsic host element — never a render. The render's
 * existence is deterministic because the element is lexically present, even
 * under `cond &&` or `.map()` (we model "may render"). A member name keeps its
 * full path so the resolver can correlate it. Props become the payload.
 */
export function collectJsxInvocations(ctx: ExtractContext): Invocation[] {
  const invocations: Invocation[] = [];
  for (const capture of ctx.query(JSX_ELEMENT_QUERY).captures(ctx.tree.rootNode)) {
    const element = capture.node;
    const callee = componentCallee(element.childForFieldName('name'));
    if (callee === null) {
      continue;
    }
    invocations.push({
      node: element,
      callee,
      kind: 'render',
      payload: buildJsxPayload(element),
    });
  }
  return invocations;
}

/** The component callee of a JSX name, or null for an intrinsic host element. */
function componentCallee(name: SyntaxNode | null): string | null {
  if (name === null) {
    return null;
  }
  if (name.type === 'member_expression') {
    return name.text; // a dotted tag is always a component
  }
  if (name.type === 'identifier' && /^[A-Z]/.test(name.text)) {
    return name.text;
  }
  return null; // lowercase identifier → intrinsic host element
}

/** Build the payload of a JSX element's attributes: named props + spreads. */
function buildJsxPayload(element: SyntaxNode): CallSitePayloadArgument[] {
  const payload: CallSitePayloadArgument[] = [];
  let ordinal = 0;
  for (const attribute of element.childrenForFieldName('attribute')) {
    if (attribute.type === 'jsx_attribute') {
      const name = attribute.namedChildren[0];
      if (name !== undefined) {
        payload.push(namedArg(ordinal, name.text, attributeValue(attribute.namedChildren[1])));
      }
    } else if (attribute.type === 'jsx_expression') {
      // A bare `{...x}` attribute is a spread.
      const spread = attribute.namedChildren[0];
      payload.push(spreadArg(ordinal, spread?.namedChildren[0]?.text ?? attribute.text));
    }
    ordinal += 1;
  }
  return payload;
}

/** The opaque value expression of a JSX attribute, or undefined for boolean shorthand. */
function attributeValue(value: SyntaxNode | undefined): string | undefined {
  if (value === undefined) {
    return undefined; // boolean shorthand, e.g. `<C disabled/>`
  }
  if (value.type === 'jsx_expression') {
    return value.namedChildren[0]?.text;
  }
  return value.text; // string literal, e.g. `b="x"`
}
