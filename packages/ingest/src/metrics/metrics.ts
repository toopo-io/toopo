import {
  type Edge,
  type GraphDocument,
  IMPORT_REFERENCE_CODES,
  isSymbolNode,
  parseSymbolId,
} from '@toopo/core';
import type { Diagnostic } from '@toopo/resolver';
import type { FileOutcome } from '../ingest/assemble.js';
import type { IngestResult, IngestTimings } from '../ingest/ingest-project.js';

/** Discovery/parse outcome counts (ADR-0015 graceful degradation made visible). */
export interface DiscoveryMetrics {
  readonly discovered: number;
  readonly analyzed: number;
  readonly parseError: number;
  readonly unsupported: number;
  readonly skipped: number;
}

/**
 * Import resolution breakdown — the headline ~90% validation metric. The
 * denominator is import bindings IN PARSED FILES: a parse-errored file emits no
 * import edges and no diagnostics, so it is excluded by construction (stated so
 * the rate is honest). `resolved = deterministic + inferred + external`;
 * `notResolved = ambiguous + unresolved`. Per the metrics ruling, the overall
 * rate and the deterministic share are reported SEPARATELY, never blended.
 */
export interface ResolutionMetrics {
  readonly deterministic: number;
  readonly inferred: number;
  readonly external: number;
  readonly ambiguous: number;
  readonly unresolved: number;
  readonly total: number;
  readonly resolved: number;
  /** resolved / total (0 when there are no imports). */
  readonly overallResolutionRate: number;
  /** deterministic / total (0 when there are no imports). */
  readonly deterministicShare: number;
}

/** Cross-file relationship outcomes — the React/TS semantics the engine recovers. */
export interface RelationshipMetrics {
  readonly renders: number;
  readonly calls: number;
  readonly propBindings: number;
  readonly argBindings: number;
  /** Edges minted by the Resolve pass (cross-file) vs the Parse pass (intra-file). */
  readonly crossFile: number;
  readonly intraFile: number;
}

export interface GraphCounts {
  readonly nodesByKind: Readonly<Record<string, number>>;
  readonly symbolsBySubKind: Readonly<Record<string, number>>;
  readonly edgesByKind: Readonly<Record<string, number>>;
}

/** A named parse-error cause (path + degradation reason), never silently dropped. */
export interface ParseErrorCause {
  readonly path: string;
  readonly reason: string;
}

export interface IngestMetrics {
  readonly discovery: DiscoveryMetrics;
  readonly graph: GraphCounts;
  readonly imports: ResolutionMetrics;
  readonly relationships: RelationshipMetrics;
  readonly parseErrors: readonly ParseErrorCause[];
  readonly timings: IngestTimings;
}

const RENDER_SUBKIND = 'react:renders';
const PROP_SUBKIND = 'react:propBinding';
const ARG_SUBKIND = 'ts:argBinding';

/**
 * Compute validation metrics from an ingest result — a PURE function over the
 * graph, diagnostics, file outcomes, and timings, so it is fully unit-testable
 * and adds no analysis the engine did not already produce.
 */
export function computeMetrics(result: IngestResult): IngestMetrics {
  return {
    discovery: discoveryMetrics(result.files),
    graph: graphCounts(result.document),
    imports: resolutionMetrics(result.document.edges, result.diagnostics),
    relationships: relationshipMetrics(result.document.edges),
    parseErrors: parseErrorCauses(result.files),
    timings: result.timings,
  };
}

function discoveryMetrics(files: readonly FileOutcome[]): DiscoveryMetrics {
  const byStatus = (status: string) => files.filter((file) => file.status === status).length;
  return {
    discovered: files.length,
    analyzed: byStatus('analyzed'),
    parseError: byStatus('parse-error'),
    unsupported: byStatus('unsupported-language'),
    skipped: byStatus('skipped'),
  };
}

function graphCounts(document: GraphDocument): GraphCounts {
  const nodesByKind = tally(document.nodes.map((node) => node.kind));
  const symbolsBySubKind = tally(document.nodes.filter(isSymbolNode).map((node) => node.subKind));
  const edgesByKind = tally(document.edges.map((edge) => edge.kind));
  return { nodesByKind, symbolsBySubKind, edgesByKind };
}

function resolutionMetrics(
  edges: readonly Edge[],
  diagnostics: readonly Diagnostic[],
): ResolutionMetrics {
  let deterministic = 0;
  let inferred = 0;
  let external = 0;
  for (const edge of edges) {
    if (edge.kind !== 'imports') {
      continue;
    }
    if (isExternalTarget(edge.targetId)) {
      external += 1;
    } else if (edge.resolution === 'inferred') {
      inferred += 1;
    } else {
      deterministic += 1;
    }
  }

  // Only IMPORT gaps belong to the import-resolution metric — its denominator is
  // import bindings. Call-site usage gaps (`unresolved-member`, `unbound-callee`,
  // ADR-0016 C11) are a different denominator and are excluded. Classification is by
  // EXACT code within the authoritative import-code set — never a `startsWith` prefix
  // (which `unresolved-member` would have wrongly swept into `unresolved`).
  const importGaps = new Set<string>(IMPORT_REFERENCE_CODES);
  let ambiguous = 0;
  let unresolved = 0;
  for (const { code } of diagnostics) {
    if (!importGaps.has(code)) {
      continue;
    }
    if (code === 'ambiguous-module' || code === 'ambiguous-export') {
      ambiguous += 1;
    } else {
      unresolved += 1; // the only remaining import codes are the unresolved-* pair
    }
  }

  const resolved = deterministic + inferred + external;
  const total = resolved + ambiguous + unresolved;
  return {
    deterministic,
    inferred,
    external,
    ambiguous,
    unresolved,
    total,
    resolved,
    overallResolutionRate: total === 0 ? 0 : resolved / total,
    deterministicShare: total === 0 ? 0 : deterministic / total,
  };
}

function relationshipMetrics(edges: readonly Edge[]): RelationshipMetrics {
  let renders = 0;
  let calls = 0;
  let propBindings = 0;
  let argBindings = 0;
  let crossFile = 0;
  let intraFile = 0;
  for (const edge of edges) {
    if (edge.provenance.pass === 'resolve') {
      crossFile += 1;
    } else if (edge.provenance.pass === 'parse') {
      intraFile += 1;
    }
    if (edge.kind === 'calls') {
      if (edge.subKind === RENDER_SUBKIND) {
        renders += 1;
      } else {
        calls += 1;
      }
    } else if (edge.kind === 'references' && edge.subKind === PROP_SUBKIND) {
      propBindings += 1;
    } else if (edge.kind === 'references' && edge.subKind === ARG_SUBKIND) {
      argBindings += 1;
    }
  }
  return { renders, calls, propBindings, argBindings, crossFile, intraFile };
}

function parseErrorCauses(files: readonly FileOutcome[]): ParseErrorCause[] {
  return files
    .filter((file) => file.status === 'parse-error')
    .map((file) => ({ path: file.path, reason: file.reason ?? 'unknown' }));
}

/** Whether an import edge's target is an external package (vs an internal symbol). */
function isExternalTarget(targetId: string): boolean {
  try {
    return parseSymbolId(targetId).package !== undefined;
  } catch {
    return false;
  }
}

/** Count occurrences of each defined value, as a plain record (undefined skipped). */
function tally(values: readonly (string | undefined)[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    if (value !== undefined) {
      counts[value] = (counts[value] ?? 0) + 1;
    }
  }
  return counts;
}
