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
  CallBinding,
  CallBindings,
  GlobalListQuery,
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
import type { Edge, Node } from '@toopo/core';
import type { GraphRepository, GraphScope, Neighbor, Page } from '@toopo/db';

/** Carry the optional page `total` into the contract envelope only when present (D9). */
function withTotal(total: number | undefined): { total?: number } {
  return total === undefined ? {} : { total };
}

/** Copy a repository page into the (mutable-array) contract envelope. */
function toNodePage(page: Page<Node>): NodePage {
  return { items: [...page.items], nextCursor: page.nextCursor, ...withTotal(page.total) };
}

function toNeighborPage(page: Page<Neighbor>): NeighborPage {
  // A repository Neighbor is structurally a contract GraphNeighbor (edge + far node).
  const items: GraphNeighbor[] = page.items.map((neighbor) => ({
    edge: neighbor.edge,
    node: neighbor.node,
  }));
  return { items, nextCursor: page.nextCursor, ...withTotal(page.total) };
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

  /**
   * D2 — a container's declarations: its direct contained nodes (a package's
   * files, a file's top-level symbols, a symbol's members), excluding call-sites.
   * The UI drills any container one level down; each node's subKind/properties say
   * what it is. Distinct from {@link declaredInterface} (the symbol-only interface).
   */
  async declarations(scope: GraphScope, query: NodeRelationsQuery): Promise<NodePage> {
    const page = await this.repository.containedDeclarations(scope, query.id, {
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

  /**
   * D1 — the binding-stitched view of one call-site: each payload argument joined
   * to the parameter/prop it binds, via the call-site's outgoing binding
   * `references` edges. A prop/arg binds its receiver BY NAME (the parser/resolver
   * binding rule), so the stitch matches each argument's name to the receiving
   * symbol's name — language-agnostic here; the binding's `subKind` stays on the
   * edge for the UI. An argument that bound nothing is shown unbound (nulls),
   * never guessed (the trust principle). Returns `null` when the id is not a
   * call-site (the host maps that to 404).
   */
  async callBindings(scope: GraphScope, query: NodeQuery): Promise<CallBindings | null> {
    const callSite = await this.repository.getNode(scope, query.id);
    if (callSite === null || callSite.kind !== 'callSite') {
      return null;
    }
    const byParamName = await this.bindingEdgesByParamName(
      scope,
      query.id,
      callSite.payload.length,
    );
    const bindings: CallBinding[] = callSite.payload.map((argument) => {
      const match = argument.name === undefined ? undefined : byParamName.get(argument.name);
      return { argument, parameter: match?.node ?? null, edge: match?.edge ?? null };
    });
    return { callSite, bindings };
  }

  /**
   * The call-site's binding `references` edges, keyed by the receiving symbol's
   * name. BOUNDED: a call-site has at most one binding per argument (each binds a
   * param/prop by name), so at most `argumentCount` edges exist — we fetch exactly
   * that many. This is a tight ceiling that can NEVER truncate a real binding
   * (which would falsely render a bound argument as unbound — the false negative
   * the endpoint forbids), unlike an unbounded fetch (a memory/DoS risk) or a
   * default page cap. The drain only iterates if a (pathological) call exceeds the
   * per-page clamp; it is bounded by `argumentCount` and never over-fetches.
   */
  private async bindingEdgesByParamName(
    scope: GraphScope,
    callSiteId: NodeQuery['id'],
    argumentCount: number,
  ): Promise<Map<string, { node: Node; edge: Edge }>> {
    const byParamName = new Map<string, { node: Node; edge: Edge }>();
    let cursor: string | undefined;
    for (let seen = 0; seen < argumentCount; ) {
      const page = await this.repository.neighborsPage(scope, callSiteId, 'out', {
        kind: 'references',
        limit: argumentCount,
        cursor,
      });
      for (const { edge, node } of page.items) {
        if (node !== null && node.kind === 'symbol') {
          byParamName.set(node.name, { node, edge });
        }
      }
      seen += page.items.length;
      if (page.nextCursor === null || page.items.length === 0) {
        break;
      }
      cursor = page.nextCursor;
    }
    return byParamName;
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

  /**
   * D5 (ADR-0029) — top-level symbols sharing a name, keyset-paged by `(name, id)`
   * so the UI groups consecutive rows under a name. All certain (a symbol's
   * existence is a parse fact): there is no trust axis, hence no accent.
   */
  async nameCollisions(scope: GraphScope, query: GlobalListQuery): Promise<NodePage> {
    const page = await this.repository.nameCollisions(scope, {
      limit: query.limit,
      cursor: query.cursor,
    });
    return toNodePage(page);
  }
}
