/**
 * The Serve pass (ADR-0016 §3, ADR-0020 Fork 1): turns the bounded read
 * primitives of a {@link GraphRepository} into the V1–V5 API responses the UI
 * consumes (the `@toopo/api-contracts` shapes). It is the read layer's
 * composition — it computes nothing the database can, holds no SQL, and depends
 * only on the repository INTERFACE, so it is backend-agnostic and reusable by
 * any host (the Nest API, the worker, tests).
 *
 * Views are derived on read (ADR-0015 §3); nothing is stored. Every edge keeps
 * its `resolution`/`confidence`, so trust stays visible to the UI (ADR-0015 §8).
 * Inputs arrive already validated at the HTTP boundary (ADR-0006); this layer
 * adapts them to repository options and adapts results back to the contract.
 */
import type {
  BlastRadiusPage,
  BlastRadiusQuery,
  GraphNeighbor,
  MapQuery,
  MapView,
  NeighborPage,
  NeighborsQuery,
  NodeDetail,
  NodePage,
  NodeQuery,
  NodeRelationsQuery,
  SearchQuery,
} from '@toopo/api-contracts';
import type { Node } from '@toopo/core';
import type { GraphRepository, GraphScope, Neighbor, Page } from '@toopo/db';

/** Copy a repository page into the (mutable-array) contract envelope. */
function toNodePage(page: Page<Node>): NodePage {
  return { items: [...page.items], nextCursor: page.nextCursor };
}

function toNeighborPage(page: Page<Neighbor>): NeighborPage {
  // A repository Neighbor is structurally a contract GraphNeighbor (edge + far node).
  const items: GraphNeighbor[] = page.items.map((neighbor) => ({
    edge: neighbor.edge,
    node: neighbor.node,
  }));
  return { items, nextCursor: page.nextCursor };
}

export class GraphViewService {
  constructor(private readonly repository: GraphRepository) {}

  /** V1 — the aggregate map at a containment level (ADR-0015 §2, §3). */
  async map(scope: GraphScope, query: MapQuery): Promise<MapView> {
    const view = await this.repository.mapView(scope, {
      level: query.level,
      scope: query.scope,
      limit: query.limit,
    });
    return {
      level: view.level,
      nodes: [...view.nodes],
      edges: [...view.edges],
      truncated: view.truncated,
    };
  }

  /**
   * V2 — composed node detail: the node plus the first page of its declared
   * interface, incoming/outgoing neighbours, and enclosed call-sites. Returns
   * `null` when the id has no node in the project (the host maps that to 404).
   */
  async nodeDetail(scope: GraphScope, query: NodeQuery): Promise<NodeDetail | null> {
    const node = await this.repository.getNode(scope, query.id);
    if (node === null) {
      return null;
    }
    const [declaredInterface, incoming, outgoing, callSites] = await Promise.all([
      this.repository.declaredInterface(scope, query.id),
      this.repository.neighborsPage(scope, query.id, 'in'),
      this.repository.neighborsPage(scope, query.id, 'out'),
      this.repository.callSitesOf(scope, query.id),
    ]);
    return {
      node,
      declaredInterface: toNodePage(declaredInterface),
      incoming: toNeighborPage(incoming),
      outgoing: toNeighborPage(outgoing),
      callSites: toNodePage(callSites),
    };
  }

  /** V3 — a bounded page of a node's neighbours (callers/callees). */
  async neighbors(scope: GraphScope, query: NeighborsQuery): Promise<NeighborPage> {
    const page = await this.repository.neighborsPage(scope, query.id, query.direction, {
      kind: query.kind,
      limit: query.limit,
      cursor: query.cursor,
    });
    return toNeighborPage(page);
  }

  /** V4 — bounded, node-hydrated blast radius with an honest `truncated` flag. */
  async blastRadius(scope: GraphScope, query: BlastRadiusQuery): Promise<BlastRadiusPage> {
    const page = await this.repository.blastRadiusPage(scope, query.id, {
      maxDepth: query.maxDepth,
      limit: query.limit,
      cursor: query.cursor,
    });
    return { items: [...page.items], nextCursor: page.nextCursor, truncated: page.truncated };
  }

  /** Zoom-in — the declared interface of a symbol (its param/prop child symbols). */
  async declaredInterface(scope: GraphScope, query: NodeRelationsQuery): Promise<NodePage> {
    const page = await this.repository.declaredInterface(scope, query.id, {
      limit: query.limit,
      cursor: query.cursor,
    });
    return toNodePage(page);
  }

  /** Zoom-in — the call-sites a symbol encloses (ADR-0015 §7 payloads). */
  async callSites(scope: GraphScope, query: NodeRelationsQuery): Promise<NodePage> {
    const page = await this.repository.callSitesOf(scope, query.id, {
      limit: query.limit,
      cursor: query.cursor,
    });
    return toNodePage(page);
  }

  /** V5 — bounded node search by name/path substring and/or kind/subKind. */
  async search(scope: GraphScope, query: SearchQuery): Promise<NodePage> {
    const page = await this.repository.search(scope, {
      query: query.query,
      kind: query.kind,
      subKind: query.subKind,
      limit: query.limit,
      cursor: query.cursor,
    });
    return toNodePage(page);
  }
}
