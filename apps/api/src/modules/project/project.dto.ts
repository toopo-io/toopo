/**
 * Nest DTOs bridging the `@toopo/api-contracts` project schemas to validation and
 * serialization (ADR-0022). The query DTO drives the global ZodValidationPipe;
 * the response DTOs drive `@ZodSerializerDto`, so every response is validated
 * against its contract on the way out (ADR-0006).
 */
import {
  ProjectListQuerySchema,
  ProjectPageSchema,
  ProjectResponseSchema,
} from '@toopo/api-contracts';
import { createZodDto } from 'nestjs-zod';

export class ProjectListQueryDto extends createZodDto(ProjectListQuerySchema) {}
export class ProjectResponseDto extends createZodDto(ProjectResponseSchema) {}
export class ProjectPageDto extends createZodDto(ProjectPageSchema) {}
