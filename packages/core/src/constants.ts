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

/**
 * Why a deferred import/usage could NOT be bound to a precise symbol (ADR-0016
 * Resolve pass). The persisted honest tail of resolution (ADR-0016 amendment): a
 * `*-module` code means the specifier matched no/ambiguous file; a `*-export`
 * code means the module resolved but the named export did not. Persisted so a
 * later "unused"/"cycle" view never mistakes a resolution gap for genuine absence.
 */
export const UNRESOLVED_REFERENCE_CODES = [
  'unresolved-module',
  'ambiguous-module',
  'unresolved-export',
  'ambiguous-export',
] as const;

/** How a value reaches a call-site argument slot (ADR-0015 §7). */
export const PASS_KINDS = ['positional', 'named', 'spread'] as const;

/**
 * Descriptor suffixes — the structural role of one segment of a stable identity
 * path. The first eight are SCIP descriptor suffixes (verified against
 * sourcegraph/scip `scip.proto`). `local` is a Toopo additive extension
 * (ADR-0027): SCIP models a local as the opaque `local <id>` symbol form, which
 * is not edit-stable; Toopo instead gives an in-scope binding (a nested function
 * or a local variable) a `local` path segment under its enclosing named scope,
 * so it is addressable and edit-stable in the same descriptor scheme. Adding a
 * suffix is non-breaking (ADR-0015 §5): existing ids never use it and still
 * round-trip; only new local ids carry it.
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
  'local',
] as const;

/**
 * A `subKind` must be language-namespaced (ADR-0015 §5, Fork 4): a lowercase
 * namespace, a colon, then a non-empty local name — e.g. `react:component`.
 */
export const SUBKIND_PATTERN = /^[a-z0-9-]+:.+$/;
