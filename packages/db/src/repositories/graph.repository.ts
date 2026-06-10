/**
 * The graph persistence abstraction (ADR-0017 §1 repository pattern), mirroring
 * {@link UserRepository}. Callers depend on this interface, never on Kysely, so
 * the storage engine stays swappable behind it. The interface grows by slice:
 * Chunk 2 added persist + getNode + neighbors + blast-radius; ADR-0020 (Serve)
 * adds the bounded read primitives the Serve pass composes — paginated
 * neighbors, search, declared-interface, call-sites, bounded blast-radius, and
 * the on-read aggregate map view.
 */
import type {
  Edge,
  EdgeKind,
  GraphDocument,
  Node,
  RESOLUTIONS,
  SymbolId,
  UnresolvedReference,
} from '@toopo/core';
import type { Page, PageOptions } from './graph-page.js';
import type { GraphScope } from './graph-scope.js';

/**
 * The trust of a blast-radius PATH (ADR-0021), mirroring an edge's `resolution`
 * (ADR-0015 §8) but quantified over a whole reverse-dependency chain rather than
 * one edge: `deterministic` iff a fully-deterministic path reaches the dependent
 * (a proven chain exists); `inferred` iff every path to it traverses ≥1 inferred
 * edge. The literal set is core's single source of truth (zero duplication).
 */
export type PathResolution = (typeof RESOLUTIONS)[number];

export interface PersistGraphResult {
  /** Distinct nodes written (after stored-once dedup). */
  readonly nodes: number;
  /** Distinct edges written (after stored-once dedup). */
  readonly edges: number;
}

/** Which way to follow edges from a node (ADR-0015 §11: reverse is derived). */
export type NeighborDirection = 'in' | 'out';

export interface Neighbor {
  /** The connecting edge, in its canonical forward direction. */
  readonly edge: Edge;
  /**
   * The node on the FAR end of the edge — the target for `out`, the source for
   * `in` — or `null` when that end is an external/unresolved identity with no
   * node row (ADR-0015 Fork 1).
   */
  readonly node: Node | null;
}

/** Default depth cap for {@link GraphRepository.blastRadius} — bounds traversal
 *  cost and guarantees termination even on a cyclic graph (ADR-0017 §6). */
export const DEFAULT_BLAST_RADIUS_MAX_DEPTH = 32;

/**
 * Default edge kinds traversed by blast-radius: the inbound DEPENDENCY kinds.
 * `contains` (pure structure) and `exports` (a symbol's own declaring module,
 * not a dependent) are excluded — re-exporting structure is not impact. Pass an
 * explicit `kinds` to override.
 */
export const DEFAULT_BLAST_RADIUS_KINDS: readonly EdgeKind[] = [
  'imports',
  'references',
  'calls',
  'extends',
  'implements',
];

export interface BlastRadiusOptions {
  /** Maximum reverse-traversal depth. Defaults to {@link DEFAULT_BLAST_RADIUS_MAX_DEPTH}. */
  readonly maxDepth?: number | undefined;
  /** Edge kinds to traverse. Defaults to {@link DEFAULT_BLAST_RADIUS_KINDS}. */
  readonly kinds?: readonly EdgeKind[] | undefined;
}

export interface BlastRadiusHit {
  /** A node that (transitively) depends on the queried node. */
  readonly nodeId: SymbolId;
  /** Shortest reverse distance from the queried node (always ≥ 1). */
  readonly depth: number;
  /**
   * Whether a PROVEN reverse-dependency chain reaches this dependent (ADR-0021):
   * `deterministic` iff some fully-deterministic path exists, else `inferred`.
   * Independent of {@link depth} — the shortest path may be inferred while a
   * longer, fully-deterministic one exists. So `depth` is proximity, never a
   * trust claim; the two are never coupled (no false certainty, ADR-0015 §8).
   */
  readonly pathResolution: PathResolution;
}

/** Page inputs for {@link GraphRepository.neighborsPage}, with the kind filter. */
export interface NeighborPageOptions extends PageOptions {
  /** Restrict to one edge kind; omitted returns every kind. */
  readonly kind?: EdgeKind | undefined;
}

/** Inputs for {@link GraphRepository.unresolvedReferences}: scoped, bounded lookup. */
export interface UnresolvedReferenceOptions extends PageOptions {
  /**
   * Restrict to references whose resolved target is this file (an `*-export` gap,
   * indexed). The "unused" honesty query: "does this file have an unresolved
   * inbound usage?" — omit to page the project's whole unresolved tail.
   */
  readonly targetFileId?: SymbolId | undefined;
}

/** Inputs for {@link GraphRepository.search}: scoped, bounded node lookup. */
export interface SearchOptions extends PageOptions {
  /** Case-insensitive literal substring matched against a node's name or path. */
  readonly query?: string | undefined;
  /** Restrict to one universal node kind (indexed). */
  readonly kind?: Node['kind'] | undefined;
  /** Restrict to one language-namespaced subKind (indexed). */
  readonly subKind?: string | undefined;
}

/** A blast-radius hit hydrated with its node (null for an external id, ADR-0015 Fork 1). */
export interface BlastRadiusNode extends BlastRadiusHit {
  readonly node: Node | null;
}

/** Page + traversal inputs for {@link GraphRepository.blastRadiusPage}. */
export interface BlastRadiusPageOptions extends PageOptions, BlastRadiusOptions {}

/** A bounded page of blast-radius hits, ordered by (depth, id). */
export interface BlastRadiusPage {
  readonly items: readonly BlastRadiusNode[];
  readonly nextCursor: string | null;
  /**
   * True when the depth cap was reached, so dependents deeper than `maxDepth`
   * may exist and are NOT included. Surfaced honestly (never silent): the UI
   * shows "impact up to depth N" rather than asserting completeness.
   */
  readonly truncated: boolean;
}

/** The containment level a {@link GraphRepository.mapView} aggregates to (ADR-0015 §2). */
export type MapLevel = 'package' | 'file' | 'symbol';

/** Inputs for the on-read aggregate map (ADR-0015 §3 — computed, never stored). */
export interface MapViewOptions {
  readonly level: MapLevel;
  /**
   * Containment scope (a parent id): the package for `level: 'file'`, the file
   * for `level: 'symbol'`. Omitted at `level: 'package'` returns all packages —
   * the always-bounded top of the map.
   */
  readonly scope?: SymbolId | undefined;
  /** Max container nodes; clamped. When more exist, {@link MapView.truncated} is set. */
  readonly limit?: number | undefined;
}

/** One container node of a map view, with the count of symbols it contains. */
export interface MapNode {
  readonly node: Node;
  readonly childCount: number;
}

/** A projected dependency edge between two container nodes, split by trust. */
export interface MapEdge {
  readonly sourceId: SymbolId;
  readonly targetId: SymbolId;
  /** Deterministic dependency edges projected onto this container pair (ADR-0015 §8). */
  readonly deterministic: number;
  /** Inferred dependency edges projected onto this container pair (ADR-0015 §8). */
  readonly inferred: number;
}

/** A scoped, bounded slice of the graph aggregated to one containment level. */
export interface MapView {
  readonly level: MapLevel;
  readonly nodes: readonly MapNode[];
  readonly edges: readonly MapEdge[];
  /** True when the container cap hid some nodes at this scope (never silent). */
  readonly truncated: boolean;
}

export interface GraphRepository {
  /**
   * Persist a graph document idempotently (ADR-0015 §11 stored-once) under a
   * project (ADR-0022 §3): nodes are upserted by `(projectId, SymbolId)`, edges
   * by `(projectId, canonical identity key)`, so re-persisting the same document
   * into the same project is a no-op on row count. The document is a fragment
   * (whole-repo or one changed file), merged into the project's current graph —
   * never a destructive replace (per-file replacement is deferred, Decision 4).
   *
   * `unresolvedReferences` is the Resolve pass's honest tail (ADR-0016 amendment,
   * C11), upserted alongside the graph in the same transaction so the persisted
   * gap never lags the graph. Omitted is treated as none.
   */
  persistGraph(
    scope: GraphScope,
    document: GraphDocument,
    unresolvedReferences?: readonly UnresolvedReference[],
  ): Promise<PersistGraphResult>;

  /**
   * Replace the project's ENTIRE graph with `document`, atomically (ADR-0025
   * Decision 4). In one transaction: delete every node and edge under the project,
   * then insert the freshly resolved document. Unlike {@link persistGraph} (an
   * additive upsert that never deletes), this reflects REMOVALS — deleted files,
   * removed symbols, and re-bound cross-file edges — which a full re-resolve
   * produces. The single transaction means a concurrent reader sees the old graph
   * or the new one, never an empty window (SQLite WAL / Postgres MVCC), and a crash
   * mid-write rolls back wholly. This is the v1 persist of the worker delta path;
   * per-file replacement (`replaceFileSubgraph`) stays deferred until resolve is
   * incremental, because full resolve can re-bind an edge sourced in an unchanged
   * file (ADR-0025 Decision 4). Re-running with the same document is a no-op on
   * row count.
   *
   * `unresolvedReferences` is the Resolve pass's honest tail (ADR-0016 amendment,
   * C11): the project's whole unresolved set is replaced in the SAME transaction
   * as the graph, so a reader never sees a fresh graph against a stale tail.
   * Omitted clears the project's unresolved references.
   */
  replaceProjectGraph(
    scope: GraphScope,
    document: GraphDocument,
    unresolvedReferences?: readonly UnresolvedReference[],
  ): Promise<PersistGraphResult>;

  /**
   * The stored content hash of every file node in the project, keyed by its
   * repo-relative path (ADR-0025 Decision 2 — the content-hash delta authority).
   * The worker compares this against the freshly cloned tree's per-file hashes to
   * classify each file changed / new / unchanged / removed. A project with no graph
   * yet returns an empty map, which the worker reads as a full first scan.
   */
  getFileContentHashes(scope: GraphScope): Promise<ReadonlyMap<string, string>>;

  /** The validated node for an id within the project, or `null` when absent. */
  getNode(scope: GraphScope, id: SymbolId): Promise<Node | null>;

  /**
   * The edges incident to a node within the project and the node on each edge's
   * far end. `out` follows forward edges (what `id` depends on), `in` follows
   * them in reverse (who depends on `id`); an optional `kind` filters to one edge
   * kind. Results are ordered deterministically by edge identity.
   */
  neighbors(
    scope: GraphScope,
    id: SymbolId,
    direction: NeighborDirection,
    kind?: EdgeKind,
  ): Promise<readonly Neighbor[]>;

  /**
   * Transitive reverse-reachability within the project: every node that
   * (transitively) depends on `id`, by following forward dependency edges
   * backwards (ADR-0015 §11). Each hit carries its shortest depth. Bounded by
   * `maxDepth` and made cycle-safe by a visited-path guard, so the traversal
   * always terminates (ADR-0017 §6). The queried node itself is never a hit.
   */
  blastRadius(
    scope: GraphScope,
    id: SymbolId,
    options?: BlastRadiusOptions,
  ): Promise<readonly BlastRadiusHit[]>;

  /**
   * Keyset-paginated {@link neighbors} (ADR-0020 Fork 4): one bounded page of a
   * node's incident edges and their far-end nodes, ordered by edge identity, with
   * a cursor for the next page. The Serve node-detail view's callers/callees.
   */
  neighborsPage(
    scope: GraphScope,
    id: SymbolId,
    direction: NeighborDirection,
    options?: NeighborPageOptions,
  ): Promise<Page<Neighbor>>;

  /**
   * Bounded node search within the project by name/path substring and/or
   * kind/subKind, keyset-paged by id. The substring match is a portable, escaped,
   * case-insensitive LIKE.
   */
  search(scope: GraphScope, options?: SearchOptions): Promise<Page<Node>>;

  /**
   * The declared interface of a symbol (ADR-0015 §6): its contained child SYMBOL
   * nodes (parameters/props/members), via `contains` edges, keyset-paged by id.
   * Their subKinds tell the UI which are params vs props; this layer stays
   * language-agnostic and returns every contained symbol.
   */
  declaredInterface(scope: GraphScope, id: SymbolId, options?: PageOptions): Promise<Page<Node>>;

  /**
   * A container's declarations (D2): its DIRECT contained nodes via `contains`,
   * EXCLUDING call-sites (which are statements, served by {@link callSitesOf}),
   * keyset-paged by id. Uniform across containment levels — a package yields its
   * files, a file its top-level symbols (functions/classes/types/variables), a
   * symbol its members — so the UI drills any container one level down. The
   * subKinds and `properties` carried on each node tell it which kind each
   * declaration is. Distinct from {@link declaredInterface}, which is the
   * symbol-only interface (params/props/members) the node-detail view composes.
   */
  containedDeclarations(
    scope: GraphScope,
    id: SymbolId,
    options?: PageOptions,
  ): Promise<Page<Node>>;

  /**
   * The call-sites enclosed by a symbol (ADR-0015 §3 zoom-in, §7 payloads),
   * looked up by `enclosing_symbol_id` (indexed, ADR-0020 A1), keyset-paged by id.
   */
  callSitesOf(scope: GraphScope, id: SymbolId, options?: PageOptions): Promise<Page<Node>>;

  /**
   * The project's persisted unresolved references (ADR-0016 amendment, C11): the
   * honest tail of resolution, keyset-paged by identity. With `targetFileId` it
   * answers "does this file have an unresolved inbound usage?" — the query a later
   * "unused" view must consult so a resolution gap is never read as genuine
   * absence. These are NOT graph edges (no unproven dependency is fabricated).
   */
  unresolvedReferences(
    scope: GraphScope,
    options?: UnresolvedReferenceOptions,
  ): Promise<Page<UnresolvedReference>>;

  /**
   * Keyset-paginated, node-hydrated {@link blastRadius} with an honest
   * depth-cap `truncated` flag — the Serve blast-radius view (ADR-0020 Fork 4).
   */
  blastRadiusPage(
    scope: GraphScope,
    id: SymbolId,
    options?: BlastRadiusPageOptions,
  ): Promise<BlastRadiusPage>;

  /**
   * The on-read aggregate map at one containment level (ADR-0015 §3) within the
   * project: container nodes (with contained-symbol counts) and the dependency
   * edges projected between them, split deterministic/inferred (ADR-0015 §8).
   * Always scoped and capped; `truncated` flags a hit cap. Never stored, never a
   * re-parse.
   */
  mapView(scope: GraphScope, options: MapViewOptions): Promise<MapView>;
}
