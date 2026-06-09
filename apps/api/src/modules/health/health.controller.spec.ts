import { Test, type TestingModule } from '@nestjs/testing';
import { HealthCheckResponseSchema } from '@toopo/api-contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [HealthService],
    }).compile();

    controller = module.get(HealthController);
  });

  it('returns a response matching HealthCheckResponseSchema', () => {
    const result = controller.check();
    const parsed = HealthCheckResponseSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });

  it('reports status "ok"', () => {
    expect(controller.check().status).toBe('ok');
  });

  it('reports a non-negative uptime', () => {
    expect(controller.check().uptime).toBeGreaterThanOrEqual(0);
  });
});
