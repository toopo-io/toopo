import type { Edge } from '../edges/edge.js';
import type { Node } from '../nodes/node.js';
import type { SymbolId } from './symbol-id.js';

/**
 * Canonical ordering by logical identity (ADR-0016 determinism: the same
 * commit must produce a byte-identical graph). The parser's output and
 * storage's read-back must order identically; sharing ONE pure comparator
 * here prevents the two consumers from drifting (Fork 8).
 *
 * `SymbolId` is the canonical encoded string, so a stable lexicographic
 * comparison of the strings is a total, deterministic order over identities.
 */
function compareStrings(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

function compareOptional(a: string | undefined, b: string | undefined): number {
  if (a === b) {
    return 0;
  }
  // Absent sorts after present, deterministically.
  if (a === undefined) {
    return 1;
  }
  if (b === undefined) {
    return -1;
  }
  return compareStrings(a, b);
}

export function compareSymbolIds(a: SymbolId, b: SymbolId): number {
  return compareStrings(a, b);
}

// Containment order; `satisfies` makes a missing or extra kind a compile error.
const NODE_KIND_ORDER = {
  repo: 0,
  package: 1,
  file: 2,
  symbol: 3,
  callSite: 4,
} satisfies Record<Node['kind'], number>;

export function compareNodes(a: Node, b: Node): number {
  const byId = compareSymbolIds(a.id, b.id);
  if (byId !== 0) {
    return byId;
  }
  return NODE_KIND_ORDER[a.kind] - NODE_KIND_ORDER[b.kind];
}

/**
 * The canonical identity of an edge as a single deterministic string — the
 * serialization counterpart of {@link compareEdges} (two edges are identical iff
 * their keys are equal), mirroring how `formatSymbolId` serializes node
 * identity. The identity is the forward-edge "stored once" tuple of ADR-0015 §11
 * — `(sourceId, kind, targetId, subKind, resolution)` — exactly the fields
 * `compareEdges` orders by; `provenance` and `confidence` are NOT identity.
 *
 * Storage uses this as the edge primary key so re-persisting a graph dedups to
 * one row per logical edge. `JSON.stringify` of a fixed-arity tuple is a total,
 * unambiguous encoding even when ids contain arbitrary characters (every value
 * is escaped), and `null` distinguishes "no subKind" from any string subKind.
 */
export function edgeIdentityKey(edge: Edge): string {
  return JSON.stringify([
    edge.sourceId,
    edge.kind,
    edge.targetId,
    edge.subKind ?? null,
    edge.resolution,
  ]);
}

export function compareEdges(a: Edge, b: Edge): number {
  const bySource = compareSymbolIds(a.sourceId, b.sourceId);
  if (bySource !== 0) {
    return bySource;
  }
  const byKind = compareStrings(a.kind, b.kind);
  if (byKind !== 0) {
    return byKind;
  }
  const byTarget = compareSymbolIds(a.targetId, b.targetId);
  if (byTarget !== 0) {
    return byTarget;
  }
  const bySubKind = compareOptional(a.subKind, b.subKind);
  if (bySubKind !== 0) {
    return bySubKind;
  }
  return compareStrings(a.resolution, b.resolution);
}

/** Return a new array of nodes in canonical order (input is never mutated). */
export function sortNodes(nodes: readonly Node[]): Node[] {
  return [...nodes].sort(compareNodes);
}

/** Return a new array of edges in canonical order (input is never mutated). */
export function sortEdges(edges: readonly Edge[]): Edge[] {
  return [...edges].sort(compareEdges);
}
