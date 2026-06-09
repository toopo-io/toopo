import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { HealthCheckResponse } from '@toopo/api-contracts';
import { HealthCheckResponseDto } from './health.schema';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Liveness and readiness probe' })
  @ApiResponse({ status: 200, type: HealthCheckResponseDto })
  check(): HealthCheckResponse {
    return this.health.report();
  }
}
