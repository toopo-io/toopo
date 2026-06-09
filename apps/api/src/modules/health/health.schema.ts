import { HealthCheckResponseSchema } from '@toopo/api-contracts';
import { createZodDto } from 'nestjs-zod';

export class HealthCheckResponseDto extends createZodDto(HealthCheckResponseSchema) {}
