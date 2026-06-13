/**
 * Nest DTOs bridging the `@toopo/api-contracts` Serve schemas to validation and
 * serialization (ADR-0020). Query DTOs drive the global ZodValidationPipe
 * (coercing/validating `@Query()`); response DTOs drive `@ZodSerializerDto`, so
 * every response is validated against its contract on the way out (ADR-0006
 * boundary validation). The schemas are the single source of truth — these are
 * thin runtime bridges only.
 */
import {
  BlastRadiusPageSchema,
  BlastRadiusQuerySchema,
  CallBindingsSchema,
  CyclePageSchema,
  GlobalListQuerySchema,
  MapQuerySchema,
  MapViewSchema,
  NeighborPageSchema,
  NeighborsQuerySchema,
  NodeDetailSchema,
  NodePageSchema,
  NodeQuerySchema,
  NodeRelationsQuerySchema,
  SearchQuerySchema,
  UnusedSymbolPageSchema,
} from '@toopo/api-contracts';
import { createZodDto } from 'nestjs-zod';

export class MapQueryDto extends createZodDto(MapQuerySchema) {}
export class NodeQueryDto extends createZodDto(NodeQuerySchema) {}
export class NeighborsQueryDto extends createZodDto(NeighborsQuerySchema) {}
export class BlastRadiusQueryDto extends createZodDto(BlastRadiusQuerySchema) {}
export class NodeRelationsQueryDto extends createZodDto(NodeRelationsQuerySchema) {}
export class SearchQueryDto extends createZodDto(SearchQuerySchema) {}
export class GlobalListQueryDto extends createZodDto(GlobalListQuerySchema) {}

export class MapViewDto extends createZodDto(MapViewSchema) {}
export class NodeDetailDto extends createZodDto(NodeDetailSchema) {}
export class CallBindingsDto extends createZodDto(CallBindingsSchema) {}
export class NeighborPageDto extends createZodDto(NeighborPageSchema) {}
export class BlastRadiusPageDto extends createZodDto(BlastRadiusPageSchema) {}
export class NodePageDto extends createZodDto(NodePageSchema) {}
export class UnusedSymbolPageDto extends createZodDto(UnusedSymbolPageSchema) {}
export class CyclePageDto extends createZodDto(CyclePageSchema) {}
