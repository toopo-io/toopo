import {
  type CallSitePayloadArgument,
  composeCallSiteId,
  type Edge,
  type Node,
  type SymbolId,
} from '@toopo/core';
import type { ExtractContext } from '@toopo/parser';
import type { Node as SyntaxNode } from 'web-tree-sitter';
import { collectCallInvocations } from './calls.js';
import { parseEdge } from './edges.js';
import { collectJsxInvocations } from './jsx.js';
import type { ExtractedSymbol } from './symbols.js';

/**
 * A unified invocation — a function call OR a JSX render. Both become
 * `callSite` nodes that share one source-ordered ordinal counter per
 * (enclosing symbol, callee), so a component that is both rendered (`<Foo/>`)
 * and called (`Foo()`) in the same symbol gets distinct call-site ids.
 */
export interface Invocation {
  readonly node: SyntaxNode;
  readonly callee: string;
  readonly kind: 'call' | 'render';
  readonly payload: CallSitePayloadArgument[];
}

export interface InvocationExtraction {
  readonly nodes: Node[];
  readonly edges: Edge[];
}

/**
 * Extract every intra-file call-site and render-site with its payload, target
 * edge, and intra-file payload bindings (ADR-0015 §4, §7). Targets are resolved
 * deterministically only where lexically knowable (in-file symbol or
 * imported-and-used external binding); a relative-imported, local-var, or
 * unknown receiver gets a call-site + payload but NO fabricated edge — the
 * resolver correlates it via `callee` ↔ `UnresolvedImport.localName`.
 */
export function extractInvocations(
  ctx: ExtractContext,
  symbols: readonly ExtractedSymbol[],
  externalBindings: ReadonlyMap<string, SymbolId>,
): InvocationExtraction {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const symbolIdByNodeId = new Map<number, SymbolId>();
  const symbolByName = new Map<string, ExtractedSymbol>();
  for (const symbol of symbols) {
    symbolIdByNodeId.set(symbol.node.id, symbol.id);
    symbolByName.set(symbol.name, symbol);
  }

  const invocations = [...collectCallInvocations(ctx), ...collectJsxInvocations(ctx)].sort(
    (a, b) => a.node.startIndex - b.node.startIndex,
  );

  const ordinalsByEnclosing = new Map<SymbolId, Map<string, number>>();
  for (const invocation of invocations) {
    const enclosingSymbolId = nearestEnclosingSymbol(invocation.node, symbolIdByNodeId);
    if (enclosingSymbolId === null) {
      continue; // not contained by an extracted symbol (module-level)
    }
    const ordinal = nextOrdinal(ordinalsByEnclosing, enclosingSymbolId, invocation.callee);
    const id = composeCallSiteId({
      enclosingSymbolId,
      calleeReference: invocation.callee,
      ordinal,
    });
    nodes.push({
      kind: 'callSite',
      id,
      enclosingSymbolId,
      callee: invocation.callee,
      ordinal,
      payload: invocation.payload,
      location: ctx.locate(invocation.node),
      properties: {},
      ...(invocation.kind === 'render' ? { subKind: 'react:element' } : {}),
    });
    edges.push(parseEdge('contains', enclosingSymbolId, id, 'react/contains-callsite'));
    edges.push(...resolveTarget(id, invocation, externalBindings, symbolByName));
  }

  return { nodes, edges };
}

/** Emit the calls/renders edge and intra-file bindings for a resolvable receiver. */
function resolveTarget(
  callSiteId: SymbolId,
  invocation: Invocation,
  externalBindings: ReadonlyMap<string, SymbolId>,
  symbolByName: ReadonlyMap<string, ExtractedSymbol>,
): Edge[] {
  const external = externalBindings.get(invocation.callee);
  if (external !== undefined) {
    return [targetEdge(callSiteId, external, invocation.kind, true)];
  }
  const receiver = symbolByName.get(invocation.callee);
  if (receiver !== undefined) {
    return [
      targetEdge(callSiteId, receiver.id, invocation.kind, false),
      ...bindPayload(callSiteId, invocation, receiver),
    ];
  }
  // local var / relative-imported / unknown → no edge (resolver-correlated)
  return [];
}

function targetEdge(
  callSiteId: SymbolId,
  targetId: SymbolId,
  kind: Invocation['kind'],
  external: boolean,
): Edge {
  if (kind === 'render') {
    const rule = external ? 'react/renders-external' : 'react/renders-local';
    return parseEdge('calls', callSiteId, targetId, rule, 'react:renders');
  }
  return parseEdge(
    'calls',
    callSiteId,
    targetId,
    external ? 'react/calls-external' : 'react/calls-local',
  );
}

/** Bind payload entries to the in-file receiver's declared params/props. */
function bindPayload(
  callSiteId: SymbolId,
  invocation: Invocation,
  receiver: ExtractedSymbol,
): Edge[] {
  const edges: Edge[] = [];
  for (const arg of invocation.payload) {
    if (invocation.kind === 'render') {
      if (arg.passKind === 'named' && arg.name !== undefined) {
        const prop = receiver.declared.find(
          (child) => child.kind === 'prop' && child.name === arg.name,
        );
        if (prop !== undefined) {
          edges.push(
            parseEdge('references', callSiteId, prop.id, 'react/binds-prop', 'react:propBinding'),
          );
        }
      }
    } else if (arg.passKind === 'positional') {
      const matches = receiver.declared.filter((child) => child.ordinal === arg.ordinal);
      const param = matches.length === 1 ? matches[0] : undefined;
      if (param !== undefined) {
        edges.push(
          parseEdge('references', callSiteId, param.id, 'react/binds-arg', 'ts:argBinding'),
        );
      }
    }
    // spreads are never bound (trust principle)
  }
  return edges;
}

/** Take and advance the next source-order ordinal for an (enclosing, callee) pair. */
function nextOrdinal(
  ordinalsByEnclosing: Map<SymbolId, Map<string, number>>,
  enclosingSymbolId: SymbolId,
  callee: string,
): number {
  let byCallee = ordinalsByEnclosing.get(enclosingSymbolId);
  if (byCallee === undefined) {
    byCallee = new Map<string, number>();
    ordinalsByEnclosing.set(enclosingSymbolId, byCallee);
  }
  const ordinal = byCallee.get(callee) ?? 0;
  byCallee.set(callee, ordinal + 1);
  return ordinal;
}

/** Walk up to the nearest ancestor that is an extracted top-level symbol. */
function nearestEnclosingSymbol(
  node: SyntaxNode,
  symbolIdByNodeId: ReadonlyMap<number, SymbolId>,
): SymbolId | null {
  let current = node.parent;
  while (current !== null) {
    const id = symbolIdByNodeId.get(current.id);
    if (id !== undefined) {
      return id;
    }
    current = current.parent;
  }
  return null;
}
