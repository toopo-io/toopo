import { type Descriptor, formatSymbolId, type GraphDocument, isSymbolNode } from '@toopo/core';
import { fileIdentity } from '@toopo/parser';

/** Build an expected id from a file path plus a descriptor chain (mirrors ctx.childId). */
export function id(path: string, ...descriptors: Descriptor[]): string {
  const base = fileIdentity(path);
  return formatSymbolId({ ...base, descriptors: [...base.descriptors, ...descriptors] });
}

export const term = (name: string): Descriptor => ({ name, suffix: 'term' });
export const param = (name: string): Descriptor => ({ name, suffix: 'parameter' });

export function projectSymbols(document: GraphDocument) {
  return document.nodes
    .filter(isSymbolNode)
    .map((node) => ({ id: node.id, name: node.name, subKind: node.subKind }));
}

export function projectEdges(document: GraphDocument) {
  return document.edges.map((edge) => ({
    kind: edge.kind,
    sourceId: edge.sourceId,
    targetId: edge.targetId,
    rule: edge.provenance.rule,
    resolution: edge.resolution,
  }));
}

/** Stable sort by JSON so multiset comparisons ignore order. */
export const byJson = <T>(items: T[]): T[] =>
  [...items].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
