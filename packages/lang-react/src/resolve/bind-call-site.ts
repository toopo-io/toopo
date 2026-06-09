import type { SymbolId } from '@toopo/core';
import {
  type CallSiteBinding,
  combineCertainty,
  type ResolvedEdge,
  type ResolvedImport,
  type SymbolView,
} from '@toopo/resolver';

/** The call-site subKind the parser tags a JSX render with, and the prop subKind
 * a component's declared props carry (ADR-0015 §5/§6). */
const RENDER_SUBKIND = 'react:element';
const PROP_SUBKIND = 'react:prop';
/** A member-root binding is never proven down to the exact member, so it is
 * inferred at this confidence (the root is solid; the member is the guess). */
const MEMBER_ROOT_CERTAINTY = { resolution: 'inferred', confidence: 'medium' } as const;

/** How a callee maps to the imported name it may bind to (ADR-0016 Fork 4). */
interface CalleeBinding {
  readonly localName: string;
  readonly precision: 'exact' | 'member-root';
}

/**
 * Bind a deferred call-site to its cross-file target (ADR-0016) — the resolve-
 * pass mirror of the parser's in-file binding.
 *
 *   - an EXACT identifier callee (`Button` → the imported `Button`) gets the
 *     `react:renders`/call target edge at the import's own certainty, and (for a
 *     render) each named prop bound to the receiver's declared `react:prop` by
 *     name — the cross-file "component A passes these props to B";
 *   - a MEMBER-ROOT callee (`Form.Item` → `Form`) binds only its resolved ROOT,
 *     tagged `react:memberRoot` and forced `inferred`: we honestly do not claim
 *     to resolve the exact member, and bind no props (those belong to the member).
 *
 * Spreads and positional/dynamic values are never bound (the trust principle).
 */
export function bindCallSite(
  callSite: CallSiteBinding,
  resolvedImports: ReadonlyMap<string, ResolvedImport>,
  symbols: SymbolView,
): readonly ResolvedEdge[] {
  const binding = calleeBinding(callSite.callee);
  if (binding === null) {
    return [];
  }
  const resolved = resolvedImports.get(binding.localName);
  if (resolved === undefined) {
    return [];
  }

  const isRender = callSite.subKind === RENDER_SUBKIND;
  if (binding.precision === 'member-root') {
    return [memberRootEdge(callSite, resolved, isRender)];
  }

  const edges: ResolvedEdge[] = [targetEdge(callSite, resolved, isRender)];
  if (isRender) {
    edges.push(...propBindings(callSite, resolved, symbols));
  }
  return edges;
}

/** The inferred edge to a member callee's resolved ROOT — never the exact member. */
function memberRootEdge(
  callSite: CallSiteBinding,
  resolved: ResolvedImport,
  isRender: boolean,
): ResolvedEdge {
  return {
    kind: 'calls',
    sourceId: callSite.callSiteId,
    targetId: resolved.symbolId,
    rule: isRender ? 'react/renders-member-root' : 'react/calls-member-root',
    subKind: 'react:memberRoot',
    certainty: combineCertainty(resolved.certainty, MEMBER_ROOT_CERTAINTY),
  };
}

/** Map a callee to its binding: an identifier is exact, a dotted member binds its root. */
function calleeBinding(callee: string): CalleeBinding | null {
  if (callee.length === 0) {
    return null;
  }
  const dot = callee.indexOf('.');
  if (dot === -1) {
    return { localName: callee, precision: 'exact' };
  }
  return { localName: callee.slice(0, dot), precision: 'member-root' };
}

/** The target `calls` edge — a `react:renders` for a render, a plain call otherwise. */
function targetEdge(
  callSite: CallSiteBinding,
  resolved: ResolvedImport,
  isRender: boolean,
): ResolvedEdge {
  return {
    kind: 'calls',
    sourceId: callSite.callSiteId,
    targetId: resolved.symbolId,
    rule: isRender ? 'react/renders-import' : 'react/calls-import',
    ...(isRender ? { subKind: 'react:renders' } : {}),
    certainty: resolved.certainty,
  };
}

/** Bind each named prop in the payload to the receiver's declared prop of that name. */
function propBindings(
  callSite: CallSiteBinding,
  resolved: ResolvedImport,
  symbols: SymbolView,
): ResolvedEdge[] {
  const propIdByName = new Map<string, SymbolId>();
  for (const child of symbols.declaredChildren(resolved.symbolId)) {
    if (child.subKind === PROP_SUBKIND) {
      propIdByName.set(child.name, child.id);
    }
  }

  const edges: ResolvedEdge[] = [];
  for (const argument of callSite.payload) {
    if (argument.passKind !== 'named' || argument.name === undefined) {
      continue; // spreads and positional/dynamic values are never bound (trust)
    }
    const propId = propIdByName.get(argument.name);
    if (propId !== undefined) {
      edges.push({
        kind: 'references',
        sourceId: callSite.callSiteId,
        targetId: propId,
        rule: 'react/binds-prop',
        subKind: 'react:propBinding',
        certainty: resolved.certainty,
      });
    }
  }
  return edges;
}
