/**
 * The typed client for the Serve read API (ADR-0020 V1–V5 + the zoom-in lists).
 * Every method builds its path from the centralized `graphApiPath`/`GRAPH_SEGMENTS`
 * (one route source of truth, ADR-0014), encodes its query via `buildQueryString`
 * (SCIP ids stay safe), and validates the response against the api-contracts
 * schema in `requestJson`. The UI consumes the read API only — it never touches
 * the DB (ADR-0020 §1).
 */
import {
  type BlastRadiusPage,
  BlastRadiusPageSchema,
  type BlastRadiusQuery,
  type CallBindings,
  CallBindingsSchema,
  type CyclePage,
  CyclePageSchema,
  type GlobalListQuery,
  GRAPH_SEGMENTS,
  graphApiPath,
  type MapQuery,
  type MapView,
  MapViewSchema,
  type NeighborPage,
  NeighborPageSchema,
  type NeighborsQuery,
  type NodeDetail,
  NodeDetailSchema,
  type NodePage,
  NodePageSchema,
  type NodeQuery,
  type NodeRelationsQuery,
  type SearchQuery,
  type UnusedSymbolPage,
  UnusedSymbolPageSchema,
} from '@toopo/api-contracts';
import { requestJson } from '../http';
import { buildQueryString } from './query';

export const graphApi = {
  // `init` lets a server component forward the session cookie for the SSR map
  // probe (ADR-0022 §5); browser callers omit it and rely on credentials:include.
  map: (
    projectId: string,
    query: MapQuery,
    locale?: string,
    init?: RequestInit,
  ): Promise<MapView> =>
    requestJson(
      `${graphApiPath(projectId, GRAPH_SEGMENTS.MAP)}${buildQueryString({ ...query })}`,
      MapViewSchema,
      locale,
      init,
    ),

  node: (projectId: string, query: NodeQuery, locale?: string): Promise<NodeDetail> =>
    requestJson(
      `${graphApiPath(projectId, GRAPH_SEGMENTS.NODE)}${buildQueryString({ ...query })}`,
      NodeDetailSchema,
      locale,
    ),

  neighbors: (projectId: string, query: NeighborsQuery, locale?: string): Promise<NeighborPage> =>
    requestJson(
      `${graphApiPath(projectId, GRAPH_SEGMENTS.NEIGHBORS)}${buildQueryString({ ...query })}`,
      NeighborPageSchema,
      locale,
    ),

  blastRadius: (
    projectId: string,
    query: BlastRadiusQuery,
    locale?: string,
  ): Promise<BlastRadiusPage> =>
    requestJson(
      `${graphApiPath(projectId, GRAPH_SEGMENTS.BLAST_RADIUS)}${buildQueryString({ ...query })}`,
      BlastRadiusPageSchema,
      locale,
    ),

  declaredInterface: (
    projectId: string,
    query: NodeRelationsQuery,
    locale?: string,
  ): Promise<NodePage> =>
    requestJson(
      `${graphApiPath(projectId, GRAPH_SEGMENTS.DECLARED_INTERFACE)}${buildQueryString({ ...query })}`,
      NodePageSchema,
      locale,
    ),

  callSites: (projectId: string, query: NodeRelationsQuery, locale?: string): Promise<NodePage> =>
    requestJson(
      `${graphApiPath(projectId, GRAPH_SEGMENTS.CALL_SITES)}${buildQueryString({ ...query })}`,
      NodePageSchema,
      locale,
    ),

  // D2 — a container's contained declarations (a symbol's locals / nested fns).
  declarations: (
    projectId: string,
    query: NodeRelationsQuery,
    locale?: string,
  ): Promise<NodePage> =>
    requestJson(
      `${graphApiPath(projectId, GRAPH_SEGMENTS.DECLARATIONS)}${buildQueryString({ ...query })}`,
      NodePageSchema,
      locale,
    ),

  // D1 — a call-site's payload arguments stitched to the params/props they bind.
  callBindings: (projectId: string, query: NodeQuery, locale?: string): Promise<CallBindings> =>
    requestJson(
      `${graphApiPath(projectId, GRAPH_SEGMENTS.CALL_BINDINGS)}${buildQueryString({ ...query })}`,
      CallBindingsSchema,
      locale,
    ),

  search: (projectId: string, query: SearchQuery, locale?: string): Promise<NodePage> =>
    requestJson(
      `${graphApiPath(projectId, GRAPH_SEGMENTS.SEARCH)}${buildQueryString({ ...query })}`,
      NodePageSchema,
      locale,
    ),

  // D5 (Insights) — top-level symbols sharing a name (ADR-0029).
  nameCollisions: (projectId: string, query: GlobalListQuery, locale?: string): Promise<NodePage> =>
    requestJson(
      `${graphApiPath(projectId, GRAPH_SEGMENTS.NAME_COLLISIONS)}${buildQueryString({ ...query })}`,
      NodePageSchema,
      locale,
    ),

  // D6 (Insights) — top-level symbols with no incoming usage (ADR-0029).
  unusedSymbols: (
    projectId: string,
    query: GlobalListQuery,
    locale?: string,
  ): Promise<UnusedSymbolPage> =>
    requestJson(
      `${graphApiPath(projectId, GRAPH_SEGMENTS.UNUSED_SYMBOLS)}${buildQueryString({ ...query })}`,
      UnusedSymbolPageSchema,
      locale,
    ),

  // D7 (Insights) — recursive cycles (SCCs) of the dependency graph (ADR-0029).
  cycles: (projectId: string, query: GlobalListQuery, locale?: string): Promise<CyclePage> =>
    requestJson(
      `${graphApiPath(projectId, GRAPH_SEGMENTS.CYCLES)}${buildQueryString({ ...query })}`,
      CyclePageSchema,
      locale,
    ),
};
