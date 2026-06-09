import type { CallSitePayloadArgument } from '@toopo/core';
import type { ExtractContext } from '@toopo/parser';
import type { Node as SyntaxNode } from 'web-tree-sitter';
import type { Invocation } from './invocations.js';
import { positionalArg, spreadArg } from './payload.js';
import { CALL_QUERY } from './queries.js';

/**
 * Collect function calls as invocations (ADR-0015 §7). An identifier callee
 * (`f()`) and a dotted member callee (`a.b()`) both become invocations carrying
 * their arguments as payload; the member callee keeps its full path so the
 * resolver can correlate it (no target edge is fabricated here). Other callee
 * forms (computed, parenthesized) have no stable reference and are skipped.
 */
export function collectCallInvocations(ctx: ExtractContext): Invocation[] {
  const invocations: Invocation[] = [];
  for (const capture of ctx.query(CALL_QUERY).captures(ctx.tree.rootNode)) {
    const call = capture.node;
    const fn = call.childForFieldName('function');
    if (fn === null || (fn.type !== 'identifier' && fn.type !== 'member_expression')) {
      continue;
    }
    invocations.push({
      node: call,
      callee: fn.text,
      kind: 'call',
      payload: buildCallPayload(call.childForFieldName('arguments')),
    });
  }
  return invocations;
}

/** Build the payload of a call's `arguments` node: positional values + spreads. */
function buildCallPayload(argsNode: SyntaxNode | null): CallSitePayloadArgument[] {
  if (argsNode === null) {
    return [];
  }
  const payload: CallSitePayloadArgument[] = [];
  let ordinal = 0;
  for (const arg of argsNode.namedChildren) {
    if (arg.type === 'spread_element') {
      payload.push(spreadArg(ordinal, arg.namedChildren[0]?.text ?? arg.text));
    } else {
      payload.push(positionalArg(ordinal, arg.text));
    }
    ordinal += 1;
  }
  return payload;
}
