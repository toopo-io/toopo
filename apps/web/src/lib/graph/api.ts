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

  search: (projectId: string, query: SearchQuery, locale?: string): Promise<NodePage> =>
    requestJson(
      `${graphApiPath(projectId, GRAPH_SEGMENTS.SEARCH)}${buildQueryString({ ...query })}`,
      NodePageSchema,
      locale,
    ),
};
