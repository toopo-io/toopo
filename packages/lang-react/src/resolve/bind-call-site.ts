import type { SymbolId } from '@toopo/core';
import {
  type CallSiteBinding,
  type CallSiteBindingResult,
  combineCertainty,
  type NamespaceImports,
  type ResolvedEdge,
  type ResolvedImport,
  type SymbolView,
  type UnresolvedUsage,
} from '@toopo/resolver';

/** The call-site subKind the parser tags a JSX render with, and the prop subKind
 * a component's declared props carry (ADR-0015 §5/§6). */
const RENDER_SUBKIND = 'react:element';
const PROP_SUBKIND = 'react:prop';
/** A member-root binding is never proven down to the exact member, so it is
 * inferred at this confidence (the root is solid; the member is the guess). */
const MEMBER_ROOT_CERTAINTY = { resolution: 'inferred', confidence: 'medium' } as const;

/** Nothing bound and nothing unresolved — the empty/exact-unresolved outcome. Frozen
 * (object and arrays) so the shared singleton can never be mutated by a caller. */
const NOTHING: CallSiteBindingResult = Object.freeze({
  edges: Object.freeze([]),
  unresolved: Object.freeze([]),
});

/** Where a fully-resolved target came from — only the provenance rule differs. */
type TargetSource = 'import' | 'namespace-member';

/** How a callee maps to the imported name it may bind to (ADR-0016 Fork 4). For a
 * member access, `memberName` is the segment after the first dot — the export a
 * namespace import resolves, or the unresolved member of a value root. */
interface CalleeBinding {
  readonly localName: string;
  readonly memberName: string;
  readonly precision: 'exact' | 'member-root';
}

/**
 * Bind a deferred call-site to its cross-file target (ADR-0016) — the resolve-
 * pass mirror of the parser's in-file binding. Returns the edges to mint AND the
 * member usages it could not bind (ADR-0016 C11), never a fabricated edge.
 *
 *   - an EXACT identifier callee (`Button` → the imported `Button`) gets the
 *     `react:renders`/call target edge at the import's own certainty, and (for a
 *     render) each named prop bound to the receiver's declared `react:prop` by
 *     name. An exact callee that names no import is left alone (not a member usage,
 *     typically a local or a global — out of the C11 boundary);
 *   - a MEMBER-ROOT callee `NS.foo` where `NS` is a NAMESPACE import resolves the
 *     member as the module's exported `foo` (C10) — the exact target, at the same
 *     certainty a named import would carry, with prop bindings like any resolved
 *     render; if the namespace names no such export, it is an ANCHORED gap on the
 *     namespace's module (`namespace-member`);
 *   - a MEMBER-ROOT callee `Form.Item` where `Form` is a VALUE import binds only
 *     its resolved ROOT, tagged `react:memberRoot` and forced `inferred` (the member
 *     is a runtime property we do not resolve), AND records the unresolved member as
 *     an ANCHORED gap on `Form`'s file (`member-root`);
 *   - a MEMBER-ROOT callee whose root is neither a value nor a namespace import (a
 *     local/param, `handler.run()`) records an ANCHORLESS gap by member name alone
 *     (`unbound-root`).
 *
 * Spreads and positional/dynamic values are never bound (the trust principle).
 */
export function bindCallSite(
  callSite: CallSiteBinding,
  resolvedImports: ReadonlyMap<string, ResolvedImport>,
  namespaceImports: NamespaceImports,
  symbols: SymbolView,
): CallSiteBindingResult {
  const binding = calleeBinding(callSite.callee);
  if (binding === null) {
    return NOTHING;
  }
  const isRender = callSite.subKind === RENDER_SUBKIND;
  const valueImport = resolvedImports.get(binding.localName);

  if (binding.precision === 'exact') {
    return valueImport === undefined
      ? NOTHING
      : { edges: targetEdges(callSite, valueImport, isRender, symbols, 'import'), unresolved: [] };
  }

  // A member access. A value root is solid but its member is an unresolved runtime
  // property; a namespace root either resolves the member to the exact export, or
  // is an anchored gap; any other root is unbound (an anchorless gap).
  if (valueImport !== undefined) {
    return {
      edges: [memberRootEdge(callSite, valueImport, isRender)],
      unresolved: [usage('member-root', callSite.callee, binding.memberName, valueImport.symbolId)],
    };
  }
  const member = namespaceImports.resolveMember(binding.localName, binding.memberName);
  if (member.status === 'resolved') {
    return {
      edges: targetEdges(callSite, member, isRender, symbols, 'namespace-member'),
      unresolved: [],
    };
  }
  if (member.status === 'unresolved-member') {
    return {
      edges: [],
      unresolved: [
        usage('namespace-member', callSite.callee, binding.memberName, member.rootFileId),
      ],
    };
  }
  return {
    edges: [],
    unresolved: [usage('unbound-root', callSite.callee, binding.memberName)],
  };
}

/** Build an unresolved member usage marker; `rootSymbolId` anchors it to a resolved
 * root (value import's symbol or namespace's module file), absent ⇒ anchorless. */
function usage(
  reason: UnresolvedUsage['reason'],
  callee: string,
  member: string,
  rootSymbolId?: SymbolId,
): UnresolvedUsage {
  return rootSymbolId === undefined
    ? { reason, callee, member }
    : { reason, callee, member, rootSymbolId };
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

/** Map a callee to its binding: an identifier is exact, a dotted member binds its
 * root and carries the member name (everything after the first dot). A trailing-dot
 * callee (`Form.`) names no member, so it binds nothing — `null`, like an empty
 * callee — and never reaches persistence as a usage with an empty member name. */
function calleeBinding(callee: string): CalleeBinding | null {
  if (callee.length === 0) {
    return null;
  }
  const dot = callee.indexOf('.');
  if (dot === -1) {
    return { localName: callee, memberName: '', precision: 'exact' };
  }
  const memberName = callee.slice(dot + 1);
  if (memberName.length === 0) {
    return null;
  }
  return { localName: callee.slice(0, dot), memberName, precision: 'member-root' };
}

/** The edges for a fully-resolved target: the `calls`/render edge plus, for a
 * render, its named prop bindings. `source` only selects the provenance rule. */
function targetEdges(
  callSite: CallSiteBinding,
  resolved: ResolvedImport,
  isRender: boolean,
  symbols: SymbolView,
  source: TargetSource,
): ResolvedEdge[] {
  const edges: ResolvedEdge[] = [targetEdge(callSite, resolved, isRender, source)];
  if (isRender) {
    edges.push(...propBindings(callSite, resolved, symbols));
  }
  return edges;
}

/** The target `calls` edge — a `react:renders` for a render, a plain call otherwise. */
function targetEdge(
  callSite: CallSiteBinding,
  resolved: ResolvedImport,
  isRender: boolean,
  source: TargetSource,
): ResolvedEdge {
  return {
    kind: 'calls',
    sourceId: callSite.callSiteId,
    targetId: resolved.symbolId,
    rule: targetRule(source, isRender),
    ...(isRender ? { subKind: 'react:renders' } : {}),
    certainty: resolved.certainty,
  };
}

/** The provenance rule for a resolved target, by how it was resolved and whether
 * it is a render — distinct rules keep namespace-member binding observable. */
function targetRule(source: TargetSource, isRender: boolean): string {
  if (source === 'namespace-member') {
    return isRender ? 'react/renders-namespace-member' : 'react/calls-namespace-member';
  }
  return isRender ? 'react/renders-import' : 'react/calls-import';
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
