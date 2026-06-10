/**
 * Nest DTOs bridging the `@toopo/api-contracts` connect schemas to validation and
 * serialization (ADR-0026 §2). The request DTO drives the global ZodValidationPipe;
 * the response DTOs drive `@ZodSerializerDto`, validating each response against its
 * contract on the way out (ADR-0006).
 */
import {
  CompleteInstallRequestSchema,
  CompleteInstallResponseSchema,
  InstallUrlResponseSchema,
} from '@toopo/api-contracts';
import { createZodDto } from 'nestjs-zod';

export class InstallUrlResponseDto extends createZodDto(InstallUrlResponseSchema) {}
export class CompleteInstallRequestDto extends createZodDto(CompleteInstallRequestSchema) {}
export class CompleteInstallResponseDto extends createZodDto(CompleteInstallResponseSchema) {}
