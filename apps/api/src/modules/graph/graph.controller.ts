/**
 * The Serve read API (ADR-0020 Phase C, V1–V5), now project-scoped and gated
 * (ADR-0022 §5). A thin HTTP skin: it validates each request via the query DTOs
 * (global ZodValidationPipe), delegates to the framework-agnostic GraphViewService
 * (@toopo/serve) under the resolved project's scope, and validates each response
 * via `@ZodSerializerDto` — no business logic here. Read-only; no mutations.
 *
 * Two guards gate every route: the SessionGuard (a valid session — this is what
 * closes Fork 5: the graph is no longer public) and the ProjectAccessGuard
 * (resolve + authorize `:projectId`, 404 unknown). The handler then scopes every
 * read by the resolved project's id, so the API can never read across tenants —
 * and beneath it the composite-key store cannot either (defense-in-depth).
 */
import { Controller, Get, NotFoundException, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type BlastRadiusPage,
  GRAPH_API_VERSION,
  GRAPH_CONTROLLER_ROUTE,
  GRAPH_SEGMENTS,
  type MapView,
  type NeighborPage,
  type NodeDetail,
  type NodePage,
} from '@toopo/api-contracts';
import type { GraphScope, ProjectRecord } from '@toopo/db';
import { GraphViewService } from '@toopo/serve';
import { ZodSerializerDto } from 'nestjs-zod';
import { CurrentProject } from '../project/current-project.decorator';
import { ProjectAccessGuard } from '../project/project-access.guard';
import { SessionGuard } from '../user/session.guard';
import {
  BlastRadiusPageDto,
  BlastRadiusQueryDto,
  MapQueryDto,
  MapViewDto,
  NeighborPageDto,
  NeighborsQueryDto,
  NodeDetailDto,
  NodePageDto,
  NodeQueryDto,
  NodeRelationsQueryDto,
  SearchQueryDto,
} from './graph.dto';

/** The graph scope of a request: the resolved project's id (ADR-0022 §3). */
function scopeOf(project: ProjectRecord): GraphScope {
  return { projectId: project.id };
}

@ApiTags('graph')
@Controller({ path: GRAPH_CONTROLLER_ROUTE, version: GRAPH_API_VERSION })
@UseGuards(SessionGuard, ProjectAccessGuard)
export class GraphController {
  constructor(private readonly views: GraphViewService) {}

  @Get(GRAPH_SEGMENTS.MAP)
  @ApiOperation({ summary: 'Aggregate map at a containment level (package/file/symbol)' })
  @ZodSerializerDto(MapViewDto)
  map(@CurrentProject() project: ProjectRecord, @Query() query: MapQueryDto): Promise<MapView> {
    return this.views.map(scopeOf(project), query);
  }

  @Get(GRAPH_SEGMENTS.NODE)
  @ApiOperation({ summary: 'Composed node detail: interface, neighbours, call-sites' })
  @ZodSerializerDto(NodeDetailDto)
  async node(
    @CurrentProject() project: ProjectRecord,
    @Query() query: NodeQueryDto,
  ): Promise<NodeDetail> {
    const detail = await this.views.nodeDetail(scopeOf(project), query);
    if (detail === null) {
      throw new NotFoundException('Node not found');
    }
    return detail;
  }

  @Get(GRAPH_SEGMENTS.NEIGHBORS)
  @ApiOperation({ summary: 'Paginated neighbours (callers/callees) of a node' })
  @ZodSerializerDto(NeighborPageDto)
  neighbors(
    @CurrentProject() project: ProjectRecord,
    @Query() query: NeighborsQueryDto,
  ): Promise<NeighborPage> {
    return this.views.neighbors(scopeOf(project), query);
  }

  @Get(GRAPH_SEGMENTS.BLAST_RADIUS)
  @ApiOperation({ summary: 'Bounded reverse-reachability (who depends on this node)' })
  @ZodSerializerDto(BlastRadiusPageDto)
  blastRadius(
    @CurrentProject() project: ProjectRecord,
    @Query() query: BlastRadiusQueryDto,
  ): Promise<BlastRadiusPage> {
    return this.views.blastRadius(scopeOf(project), query);
  }

  @Get(GRAPH_SEGMENTS.DECLARED_INTERFACE)
  @ApiOperation({ summary: "A symbol's declared interface (param/prop child symbols)" })
  @ZodSerializerDto(NodePageDto)
  declaredInterface(
    @CurrentProject() project: ProjectRecord,
    @Query() query: NodeRelationsQueryDto,
  ): Promise<NodePage> {
    return this.views.declaredInterface(scopeOf(project), query);
  }

  @Get(GRAPH_SEGMENTS.CALL_SITES)
  @ApiOperation({ summary: 'The call-sites a symbol encloses' })
  @ZodSerializerDto(NodePageDto)
  callSites(
    @CurrentProject() project: ProjectRecord,
    @Query() query: NodeRelationsQueryDto,
  ): Promise<NodePage> {
    return this.views.callSites(scopeOf(project), query);
  }

  @Get(GRAPH_SEGMENTS.SEARCH)
  @ApiOperation({ summary: 'Search nodes by name/path substring and/or kind/subKind' })
  @ZodSerializerDto(NodePageDto)
  search(
    @CurrentProject() project: ProjectRecord,
    @Query() query: SearchQueryDto,
  ): Promise<NodePage> {
    return this.views.search(scopeOf(project), query);
  }
}
