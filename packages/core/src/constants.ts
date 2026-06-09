/**
 * Closed, ratified vocabularies for the universal code-graph model (ADR-0015).
 *
 * The node-kind and edge-kind sets are deliberately minimal and CLOSED:
 * adding a member later is non-breaking; renaming or removing one is breaking
 * (ADR-0015 §5). Language-specific richness lives in the open, namespaced
 * `subKind` of each node/edge, owned by `lang-*` packages — never here.
 */

/** Serialization format version carried once on the graph envelope (ADR-0015, Fork 3). */
export const FORMAT_VERSION = 1;

/** Universal, structural node kinds (closed set — ADR-0015 §5). */
export const NODE_KINDS = ['repo', 'package', 'file', 'symbol', 'callSite'] as const;

/** Universal edge kinds (closed set — ADR-0015 §5). */
export const EDGE_KINDS = [
  'contains',
  'imports',
  'exports',
  'references',
  'calls',
  'extends',
  'implements',
] as const;

/** Whether a fact was statically proven or heuristically inferred (ADR-0015 §8). */
export const RESOLUTIONS = ['deterministic', 'inferred'] as const;

/** Coarse confidence, present only on `inferred` facts (ADR-0015 §8). */
export const CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const;

/** Per-entry analysis outcome enabling graceful degradation (ADR-0015 §9). */
export const ANALYSIS_STATUSES = [
  'analyzed',
  'unsupported-language',
  'parse-error',
  'skipped',
] as const;

/** Which deterministic pass (or the AI overlay) produced an edge (ADR-0015 §8, ADR-0016). */
export const PROVENANCE_PASSES = ['parse', 'resolve', 'ai'] as const;

/** How a value reaches a call-site argument slot (ADR-0015 §7). */
export const PASS_KINDS = ['positional', 'named', 'spread'] as const;

/**
 * SCIP descriptor suffixes (verified against sourcegraph/scip `scip.proto`).
 * Each names the structural role of one segment of a stable identity path.
 */
export const DESCRIPTOR_SUFFIXES = [
  'namespace',
  'type',
  'term',
  'method',
  'type-parameter',
  'parameter',
  'meta',
  'macro',
] as const;

/**
 * A `subKind` must be language-namespaced (ADR-0015 §5, Fork 4): a lowercase
 * namespace, a colon, then a non-empty local name — e.g. `react:component`.
 */
export const SUBKIND_PATTERN = /^[a-z0-9-]+:.+$/;
