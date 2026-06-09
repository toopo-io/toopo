/**
 * The Serve read API (ADR-0020 Phase C, V1–V5). A thin HTTP skin: it validates
 * each request via the query DTOs (global ZodValidationPipe), delegates to the
 * framework-agnostic GraphViewService (@toopo/serve), and validates each
 * response via `@ZodSerializerDto` — no business logic here. Read-only; no
 * mutations. Node ids arrive as query params (SCIP ids contain `/`).
 */
import { Controller, Get, NotFoundException, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type BlastRadiusPage,
  GRAPH_API_VERSION,
  GRAPH_CONTROLLER_PATH,
  GRAPH_SEGMENTS,
  type MapView,
  type NeighborPage,
  type NodeDetail,
  type NodePage,
} from '@toopo/api-contracts';
import { GraphViewService } from '@toopo/serve';
import { ZodSerializerDto } from 'nestjs-zod';
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

@ApiTags('graph')
@Controller({ path: GRAPH_CONTROLLER_PATH, version: GRAPH_API_VERSION })
export class GraphController {
  constructor(private readonly views: GraphViewService) {}

  @Get(GRAPH_SEGMENTS.MAP)
  @ApiOperation({ summary: 'Aggregate map at a containment level (package/file/symbol)' })
  @ZodSerializerDto(MapViewDto)
  map(@Query() query: MapQueryDto): Promise<MapView> {
    return this.views.map(query);
  }

  @Get(GRAPH_SEGMENTS.NODE)
  @ApiOperation({ summary: 'Composed node detail: interface, neighbours, call-sites' })
  @ZodSerializerDto(NodeDetailDto)
  async node(@Query() query: NodeQueryDto): Promise<NodeDetail> {
    const detail = await this.views.nodeDetail(query);
    if (detail === null) {
      throw new NotFoundException('Node not found');
    }
    return detail;
  }

  @Get(GRAPH_SEGMENTS.NEIGHBORS)
  @ApiOperation({ summary: 'Paginated neighbours (callers/callees) of a node' })
  @ZodSerializerDto(NeighborPageDto)
  neighbors(@Query() query: NeighborsQueryDto): Promise<NeighborPage> {
    return this.views.neighbors(query);
  }

  @Get(GRAPH_SEGMENTS.BLAST_RADIUS)
  @ApiOperation({ summary: 'Bounded reverse-reachability (who depends on this node)' })
  @ZodSerializerDto(BlastRadiusPageDto)
  blastRadius(@Query() query: BlastRadiusQueryDto): Promise<BlastRadiusPage> {
    return this.views.blastRadius(query);
  }

  @Get(GRAPH_SEGMENTS.DECLARED_INTERFACE)
  @ApiOperation({ summary: "A symbol's declared interface (param/prop child symbols)" })
  @ZodSerializerDto(NodePageDto)
  declaredInterface(@Query() query: NodeRelationsQueryDto): Promise<NodePage> {
    return this.views.declaredInterface(query);
  }

  @Get(GRAPH_SEGMENTS.CALL_SITES)
  @ApiOperation({ summary: 'The call-sites a symbol encloses' })
  @ZodSerializerDto(NodePageDto)
  callSites(@Query() query: NodeRelationsQueryDto): Promise<NodePage> {
    return this.views.callSites(query);
  }

  @Get(GRAPH_SEGMENTS.SEARCH)
  @ApiOperation({ summary: 'Search nodes by name/path substring and/or kind/subKind' })
  @ZodSerializerDto(NodePageDto)
  search(@Query() query: SearchQueryDto): Promise<NodePage> {
    return this.views.search(query);
  }
}
