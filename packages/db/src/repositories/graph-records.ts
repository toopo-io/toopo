/**
 * Pure mappers between graph rows and `@toopo/core` objects — the storage
 * boundary (ADR-0006, ADR-0017 §10). Every read is validated against the core
 * Zod schemas, so persistence can never reintroduce invalid graph state; every
 * write is derived structurally from a validated core object.
 *
 * JSON columns cross two backends with different readback shapes: libSQL `text`
 * returns a string to parse, Postgres `jsonb` returns an already-parsed value.
 * `readJson` normalizes both. Writes always send a JSON string, which both
 * backends accept. The graph schema has no Date or boolean columns, so JSON is
 * the only readback asymmetry to reconcile.
 */
import {
  type Edge,
  EdgeSchema,
  edgeIdentityKey,
  type JsonObject,
  JsonObjectSchema,
  type Node,
  NodeSchema,
} from '@toopo/core';
import type { Insertable, Selectable } from 'kysely';
import type { EdgeTable, NodeTable } from '../schema/graph-types.js';

type NodeRow = Selectable<NodeTable>;
type EdgeRow = Selectable<EdgeTable>;
type NodeInsert = Insertable<NodeTable>;
type EdgeInsert = Insertable<EdgeTable>;

/** Normalize a JSON column readback: parse libSQL's string, pass Postgres's object. */
function readJson(value: unknown): unknown {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

function readProperties(value: unknown): JsonObject {
  return JsonObjectSchema.parse(readJson(value) ?? {});
}

/**
 * Rebuild the analysis discriminator from its two columns. A non-`analyzed`
 * status carries its reason; the core `AnalysisSchema` (via `NodeSchema.parse`)
 * rejects a missing reason, so a corrupt row fails loudly at the boundary.
 */
function readAnalysis(
  status: string | null,
  reason: string | null,
): Record<string, unknown> | undefined {
  if (status === null) {
    return undefined;
  }
  if (status === 'analyzed') {
    return { status };
  }
  return { status, reason };
}

/** Map a row to a validated core node, or throw at the boundary on corruption. */
export function rowToNode(row: NodeRow): Node {
  const candidate: Record<string, unknown> = {
    kind: row.kind,
    id: row.id,
    properties: readProperties(row.properties),
  };
  if (row.sub_kind !== null) {
    candidate['subKind'] = row.sub_kind;
  }
  if (row.location !== null && row.location !== undefined) {
    candidate['location'] = readJson(row.location);
  }
  const analysis = readAnalysis(row.analysis_status, row.analysis_reason);
  if (analysis !== undefined) {
    candidate['analysis'] = analysis;
  }

  switch (row.kind) {
    case 'repo':
    case 'symbol':
      candidate['name'] = row.name;
      break;
    case 'package':
      candidate['name'] = row.name;
      if (row.version !== null) {
        candidate['version'] = row.version;
      }
      break;
    case 'file':
      candidate['path'] = row.path;
      candidate['contentHash'] = row.content_hash;
      break;
    case 'callSite':
      candidate['enclosingSymbolId'] = row.enclosing_symbol_id;
      candidate['callee'] = row.callee;
      candidate['ordinal'] = row.ordinal;
      candidate['payload'] =
        row.payload !== null && row.payload !== undefined ? readJson(row.payload) : [];
      break;
    default:
      throw new Error(`rowToNode: unknown node kind "${String(row.kind)}" for id "${row.id}"`);
  }

  return NodeSchema.parse(candidate);
}

function analysisReason(node: Node): string | null {
  const analysis = node.analysis;
  return analysis !== undefined && analysis.status !== 'analyzed' ? analysis.reason : null;
}

/** Map a validated core node to its insert row. `fileId` is the incremental key. */
export function nodeToInsert(node: Node, fileId: string | null): NodeInsert {
  const base: NodeInsert = {
    id: node.id,
    kind: node.kind,
    sub_kind: node.subKind ?? null,
    name: null,
    path: null,
    content_hash: null,
    version: null,
    enclosing_symbol_id: null,
    callee: null,
    ordinal: null,
    analysis_status: node.analysis?.status ?? null,
    analysis_reason: analysisReason(node),
    file_id: fileId,
    location: node.location !== undefined ? JSON.stringify(node.location) : null,
    payload: null,
    properties: JSON.stringify(node.properties),
  };

  switch (node.kind) {
    case 'repo':
    case 'symbol':
      return { ...base, name: node.name };
    case 'package':
      return { ...base, name: node.name, version: node.version ?? null };
    case 'file':
      return { ...base, path: node.path, content_hash: node.contentHash };
    case 'callSite':
      return {
        ...base,
        enclosing_symbol_id: node.enclosingSymbolId,
        callee: node.callee,
        ordinal: node.ordinal,
        payload: JSON.stringify(node.payload),
      };
  }
}

/** Map a row to a validated core edge, or throw at the boundary on corruption. */
export function rowToEdge(row: EdgeRow): Edge {
  const candidate: Record<string, unknown> = {
    kind: row.kind,
    sourceId: row.source_id,
    targetId: row.target_id,
    resolution: row.resolution,
    provenance: { pass: row.provenance_pass, rule: row.provenance_rule },
  };
  if (row.sub_kind !== null) {
    candidate['subKind'] = row.sub_kind;
  }
  if (row.confidence !== null) {
    candidate['confidence'] = row.confidence;
  }
  return EdgeSchema.parse(candidate);
}

/** Map a validated core edge to its insert row, keyed by canonical identity. */
export function edgeToInsert(edge: Edge, fileId: string | null): EdgeInsert {
  return {
    edge_key: edgeIdentityKey(edge),
    source_id: edge.sourceId,
    target_id: edge.targetId,
    kind: edge.kind,
    sub_kind: edge.subKind ?? null,
    resolution: edge.resolution,
    confidence: edge.resolution === 'inferred' ? edge.confidence : null,
    provenance_pass: edge.provenance.pass,
    provenance_rule: edge.provenance.rule,
    file_id: fileId,
  };
}
