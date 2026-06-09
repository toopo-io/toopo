import type { Edge } from '../edges/edge.js';
import type { SymbolIdentity } from '../identity/symbol-id.js';
import type {
  CallSiteNode,
  FileNode,
  Node,
  PackageNode,
  RepoNode,
  SymbolNode,
} from '../nodes/node.js';

/**
 * Pure type guards over the discriminated unions. They let consumers narrow a
 * `Node`/`Edge` without re-validating, and keep the `deterministic | inferred`
 * distinction (ADR-0015 §8) ergonomic at call sites.
 */
export function isRepoNode(node: Node): node is RepoNode {
  return node.kind === 'repo';
}

export function isPackageNode(node: Node): node is PackageNode {
  return node.kind === 'package';
}

export function isFileNode(node: Node): node is FileNode {
  return node.kind === 'file';
}

export function isSymbolNode(node: Node): node is SymbolNode {
  return node.kind === 'symbol';
}

export function isCallSiteNode(node: Node): node is CallSiteNode {
  return node.kind === 'callSite';
}

export type DeterministicEdge = Extract<Edge, { resolution: 'deterministic' }>;
export type InferredEdge = Extract<Edge, { resolution: 'inferred' }>;

export function isDeterministicEdge(edge: Edge): edge is DeterministicEdge {
  return edge.resolution === 'deterministic';
}

export function isInferredEdge(edge: Edge): edge is InferredEdge {
  return edge.resolution === 'inferred';
}

/** Whether an identity refers to a symbol outside the analyzed repo (ADR-0015 Fork 1). */
export function isExternalIdentity(identity: SymbolIdentity): boolean {
  return identity.package !== undefined;
}
