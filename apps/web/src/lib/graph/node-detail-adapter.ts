/**
 * Pure adapter: a Serve V2 `NodeDetail` (ADR-0020 §5) → a flat view-model the
 * detail panel renders. It surfaces trust on EVERY
 * relationship (ADR-0015 §8): each neighbour and each passed argument carries its
 * `trustKind` (+ `confidence` for inferred), so the panel can mark every row
 * solid/dashed exactly like the map. The far node of a neighbour may be `null`
 * (an external/unresolved id, ADR-0015 §11) — represented honestly as a missing
 * label, never invented.
 */
import type { CallBinding, NodeDetail } from '@toopo/api-contracts';
import type { Confidence, Edge, EdgeKind, Node } from '@toopo/core';
import { childSymbolCategory } from './child-symbol-category';
import { nodeLabel } from './node-label';
import { composeSignature, type ParsedJsdoc, parseJsdoc } from './node-signature';
import type { TrustKind } from './trust';

/**
 * The edge kinds that are DEPENDENCIES (who calls/uses whom), as opposed to
 * structure (`contains`/`exports`). Callers/callees show only these — the same
 * definition the map projection and blast radius use — so the panel does not
 * echo a symbol's own params/call-sites (which have their own sections) as
 * "callees".
 */
const DEPENDENCY_EDGE_KINDS: ReadonlySet<EdgeKind> = new Set([
  'imports',
  'references',
  'calls',
  'extends',
  'implements',
]);

export interface InterfaceRow {
  readonly id: string;
  readonly label: string;
  readonly subKind?: string;
  /** The declared type, when recorded (rendered after the name). */
  readonly type?: string;
  /** Whether the parameter/prop is optional, when recorded. */
  readonly optional?: boolean;
}

/** One payload argument stitched to the parameter it binds (D1). */
export interface BindingRow {
  readonly ordinal: number;
  readonly argName?: string;
  readonly argValue?: string;
  readonly passKind: 'positional' | 'named' | 'spread';
  /** The bound parameter's label, or null when the argument bound to nothing. */
  readonly paramLabel: string | null;
  /** True when the binding is inferred OR unbound — shown in the accent. */
  readonly uncertain: boolean;
  readonly trustKind: TrustKind;
  readonly confidence?: Confidence;
}

/** The contained child symbols split into the inspector's lazy buckets (F1). */
export interface DeclarationBuckets {
  readonly locals: readonly InterfaceRow[];
  readonly nested: readonly InterfaceRow[];
}

export interface NeighborRow {
  readonly edgeKind: EdgeKind;
  readonly trustKind: TrustKind;
  readonly confidence?: Confidence;
  /** The far-end node id (the caller for incoming, the callee for outgoing). */
  readonly nodeId: string;
  /** The far node's label, or `null` when the id is external/unresolved. */
  readonly label: string | null;
}

interface PayloadArgRow {
  readonly ordinal: number;
  readonly name?: string;
  readonly passKind: 'positional' | 'named' | 'spread';
  readonly value?: string;
  readonly trustKind: TrustKind;
  readonly confidence?: Confidence;
}

export interface CallSiteRow {
  readonly id: string;
  readonly callee: string;
  readonly args: readonly PayloadArgRow[];
}

export interface NodeDetailViewModel {
  readonly id: string;
  readonly label: string;
  readonly kind: Node['kind'];
  readonly subKind?: string;
  readonly analysisStatus?: string;
  /** The composed `name(params): returnType`, omit-never-fabricate (F2). */
  readonly signature: string;
  /** The parsed JSDoc, verbatim, or null when none is recorded (F2). */
  readonly jsdoc: ParsedJsdoc | null;
  /** True when any incoming/outgoing edge is inferred — drives the callout. */
  readonly hasInferredEdge: boolean;
  /** The declared parameters/props (the declared interface). */
  readonly parameters: readonly InterfaceRow[];
  readonly callers: readonly NeighborRow[];
  readonly callees: readonly NeighborRow[];
  readonly callSites: readonly CallSiteRow[];
}

export function nodeDetailToViewModel(detail: NodeDetail): NodeDetailViewModel {
  const { node } = detail;
  const parameters = detail.declaredInterface.items.map(toInterfaceRow);
  // Each param carries its type when recorded; composeSignature omits the ones
  // that are absent — `f(a: T, b, c: U)` — rather than dropping every type the
  // moment one param lacks one (faithful, not fabricated).
  const signatureParams = parameters.map((row) =>
    row.type !== undefined ? { name: row.label, type: row.type } : { name: row.label },
  );
  return {
    id: node.id,
    label: nodeLabel(node),
    kind: node.kind,
    ...(node.subKind !== undefined ? { subKind: node.subKind } : {}),
    ...(node.analysis !== undefined ? { analysisStatus: node.analysis.status } : {}),
    signature: composeSignature(nodeLabel(node), signatureParams, stringProp(node, 'returnType')),
    jsdoc: jsdocOf(node),
    hasInferredEdge:
      detail.incoming.items.some((n) => n.edge.resolution === 'inferred') ||
      detail.outgoing.items.some((n) => n.edge.resolution === 'inferred'),
    parameters,
    callers: detail.incoming.items
      .filter((neighbor) => DEPENDENCY_EDGE_KINDS.has(neighbor.edge.kind))
      .map((neighbor) => toNeighborRow(neighbor, 'in')),
    callees: detail.outgoing.items
      .filter((neighbor) => DEPENDENCY_EDGE_KINDS.has(neighbor.edge.kind))
      .map((neighbor) => toNeighborRow(neighbor, 'out')),
    callSites: detail.callSites.items.map(toCallSiteRow),
  };
}

/** Split a container's contained declarations into the lazy local/nested buckets. */
export function declarationBuckets(items: readonly Node[]): DeclarationBuckets {
  const locals: InterfaceRow[] = [];
  const nested: InterfaceRow[] = [];
  for (const node of items) {
    const category = childSymbolCategory(node.subKind);
    if (category === 'local') {
      locals.push(toInterfaceRow(node));
    } else if (category === 'nested') {
      nested.push(toInterfaceRow(node));
    }
  }
  return { locals, nested };
}

/** Stitch a call-site's payload arguments to the parameters they bind (D1). */
export function callBindingRows(bindings: readonly CallBinding[]): BindingRow[] {
  return bindings.map((binding) => {
    const { argument, parameter, edge } = binding;
    const inferred = edge !== null && edge.resolution === 'inferred';
    const uncertain = parameter === null || inferred;
    return {
      ordinal: argument.ordinal,
      ...(argument.name !== undefined ? { argName: argument.name } : {}),
      ...(argument.value !== undefined ? { argValue: argument.value } : {}),
      passKind: argument.passKind,
      paramLabel: parameter !== null ? nodeLabel(parameter) : null,
      uncertain,
      trustKind: uncertain ? 'inferred' : 'deterministic',
      ...(inferred ? { confidence: edge.confidence } : {}),
    };
  });
}

function toInterfaceRow(node: Node): InterfaceRow {
  const type = stringProp(node, 'type');
  return {
    id: node.id,
    label: nodeLabel(node),
    ...(node.subKind !== undefined ? { subKind: node.subKind } : {}),
    ...(type !== undefined ? { type } : {}),
    ...(node.properties['optional'] === true ? { optional: true } : {}),
  };
}

/** A string-valued property from a node's open properties bag, or undefined. */
function stringProp(node: Node, key: string): string | undefined {
  const value = node.properties[key];
  return typeof value === 'string' ? value : undefined;
}

/** The parsed JSDoc from a node's `jsdoc` property, verbatim (F2). */
function jsdocOf(node: Node): ParsedJsdoc | null {
  const raw = stringProp(node, 'jsdoc');
  return raw !== undefined ? parseJsdoc(raw) : null;
}

function toNeighborRow(
  neighbor: { readonly edge: Edge; readonly node: Node | null },
  direction: 'in' | 'out',
): NeighborRow {
  const { edge, node } = neighbor;
  const farId = direction === 'in' ? edge.sourceId : edge.targetId;
  return {
    edgeKind: edge.kind,
    nodeId: farId,
    label: node !== null ? nodeLabel(node) : null,
    ...trustOf(edge),
  };
}

function toCallSiteRow(node: Node): CallSiteRow {
  if (node.kind !== 'callSite') {
    // The call-sites list always holds call-site nodes; degrade honestly rather
    // than fabricate payload data if the contract ever surprises us.
    return { id: node.id, callee: nodeLabel(node), args: [] };
  }
  return {
    id: node.id,
    callee: node.callee,
    args: node.payload.map((arg) => ({
      ordinal: arg.ordinal,
      ...(arg.name !== undefined ? { name: arg.name } : {}),
      passKind: arg.passKind,
      ...(arg.value !== undefined ? { value: arg.value } : {}),
      ...trustOf(arg),
    })),
  };
}

/** Extract the §8 trust discriminator from any resolution-tagged fact. */
function trustOf(
  fact: { resolution: 'deterministic' } | { resolution: 'inferred'; confidence: Confidence },
): {
  trustKind: TrustKind;
  confidence?: Confidence;
} {
  return fact.resolution === 'inferred'
    ? { trustKind: 'inferred', confidence: fact.confidence }
    : { trustKind: 'deterministic' };
}
