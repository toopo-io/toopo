/**
 * Kysely implementation of {@link GraphRepository}, split across focused modules
 * behind this thin facade. Every module upholds the same invariants (ADR-0017
 * §6): queries are parameterized and portable across both backends, and every
 * row leaves through the core Zod boundary.
 *
 * This class holds the database handle and forwards each operation to its domain
 * module — persistence, core reads, Serve reads, the global derived views, and
 * the map view. The split keeps each concern under the size budget without
 * changing the public surface; the methods here ARE the {@link GraphRepository}
 * contract.
 */
import type { EdgeKind, GraphDocument, Node, SymbolId, UnresolvedReference } from '@toopo/core';
import type { Kysely } from 'kysely';
import type { GraphDatabase } from '../schema/graph-types.js';
import * as coreReads from './graph.core-reads.js';
import * as globalViews from './graph.global-views.js';
import * as mapViewModule from './graph.map-view.js';
import * as persist from './graph.persist.js';
import type {
  BlastRadiusHit,
  BlastRadiusOptions,
  BlastRadiusPage,
  BlastRadiusPageOptions,
  DependencyEdge,
  GraphRepository,
  MapView,
  MapViewOptions,
  Neighbor,
  NeighborDirection,
  NeighborPageOptions,
  PersistGraphResult,
  SearchOptions,
  UnresolvedReferenceOptions,
  UnusedSymbol,
} from './graph.repository.js';
import * as serveReads from './graph.serve-reads.js';
import type { Page, PageOptions } from './graph-page.js';
import type { GraphScope } from './graph-scope.js';

export class KyselyGraphRepository implements GraphRepository {
  constructor(private readonly db: Kysely<GraphDatabase>) {}

  persistGraph(
    scope: GraphScope,
    document: GraphDocument,
    unresolvedReferences: readonly UnresolvedReference[] = [],
  ): Promise<PersistGraphResult> {
    return persist.persistGraph(this.db, scope, document, unresolvedReferences);
  }

  replaceProjectGraph(
    scope: GraphScope,
    document: GraphDocument,
    unresolvedReferences: readonly UnresolvedReference[] = [],
  ): Promise<PersistGraphResult> {
    return persist.replaceProjectGraph(this.db, scope, document, unresolvedReferences);
  }

  getFileContentHashes(scope: GraphScope): Promise<ReadonlyMap<string, string>> {
    return coreReads.getFileContentHashes(this.db, scope);
  }

  getNode(scope: GraphScope, id: SymbolId): Promise<Node | null> {
    return coreReads.getNode(this.db, scope, id);
  }

  neighbors(
    scope: GraphScope,
    id: SymbolId,
    direction: NeighborDirection,
    kind?: EdgeKind,
  ): Promise<readonly Neighbor[]> {
    return coreReads.neighbors(this.db, scope, id, direction, kind);
  }

  neighborsPage(
    scope: GraphScope,
    id: SymbolId,
    direction: NeighborDirection,
    options?: NeighborPageOptions,
  ): Promise<Page<Neighbor>> {
    return coreReads.neighborsPage(this.db, scope, id, direction, options);
  }

  blastRadius(
    scope: GraphScope,
    id: SymbolId,
    options?: BlastRadiusOptions,
  ): Promise<readonly BlastRadiusHit[]> {
    return coreReads.blastRadius(this.db, scope, id, options);
  }

  blastRadiusPage(
    scope: GraphScope,
    id: SymbolId,
    options?: BlastRadiusPageOptions,
  ): Promise<BlastRadiusPage> {
    return coreReads.blastRadiusPage(this.db, scope, id, options);
  }

  search(scope: GraphScope, options?: SearchOptions): Promise<Page<Node>> {
    return serveReads.search(this.db, scope, options);
  }

  declaredInterface(scope: GraphScope, id: SymbolId, options?: PageOptions): Promise<Page<Node>> {
    return serveReads.declaredInterface(this.db, scope, id, options);
  }

  containedDeclarations(
    scope: GraphScope,
    id: SymbolId,
    options?: PageOptions,
  ): Promise<Page<Node>> {
    return serveReads.containedDeclarations(this.db, scope, id, options);
  }

  callSitesOf(scope: GraphScope, id: SymbolId, options?: PageOptions): Promise<Page<Node>> {
    return serveReads.callSitesOf(this.db, scope, id, options);
  }

  unresolvedReferences(
    scope: GraphScope,
    options?: UnresolvedReferenceOptions,
  ): Promise<Page<UnresolvedReference>> {
    return serveReads.unresolvedReferences(this.db, scope, options);
  }

  nameCollisions(scope: GraphScope, options?: PageOptions): Promise<Page<Node>> {
    return globalViews.nameCollisions(this.db, scope, options);
  }

  unusedSymbols(scope: GraphScope, options?: PageOptions): Promise<Page<UnusedSymbol>> {
    return globalViews.unusedSymbols(this.db, scope, options);
  }

  cyclicDependencyEdges(scope: GraphScope, options?: PageOptions): Promise<Page<DependencyEdge>> {
    return globalViews.cyclicDependencyEdges(this.db, scope, options);
  }

  mapView(scope: GraphScope, options: MapViewOptions): Promise<MapView> {
    return mapViewModule.mapView(this.db, scope, options);
  }
}
