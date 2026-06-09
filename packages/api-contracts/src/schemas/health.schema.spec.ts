import { describe, expect, it } from 'vitest';
import { HealthCheckResponseSchema, HealthStatusSchema } from './health.schema';

describe('HealthCheckResponseSchema', () => {
  it('parses a valid response', () => {
    const result = HealthCheckResponseSchema.safeParse({
      status: 'ok',
      timestamp: '2026-05-14T12:00:00.000Z',
      uptime: 123.45,
      version: '0.0.0',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid status value', () => {
    const result = HealthCheckResponseSchema.safeParse({
      status: 'broken',
      timestamp: '2026-05-14T12:00:00.000Z',
      uptime: 0,
      version: '0.0.0',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-ISO timestamp', () => {
    const result = HealthCheckResponseSchema.safeParse({
      status: 'ok',
      timestamp: 'yesterday',
      uptime: 0,
      version: '0.0.0',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a negative uptime', () => {
    const result = HealthCheckResponseSchema.safeParse({
      status: 'ok',
      timestamp: '2026-05-14T12:00:00.000Z',
      uptime: -1,
      version: '0.0.0',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty version', () => {
    const result = HealthCheckResponseSchema.safeParse({
      status: 'ok',
      timestamp: '2026-05-14T12:00:00.000Z',
      uptime: 0,
      version: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('HealthStatusSchema', () => {
  it('accepts ok, degraded, down', () => {
    expect(HealthStatusSchema.safeParse('ok').success).toBe(true);
    expect(HealthStatusSchema.safeParse('degraded').success).toBe(true);
    expect(HealthStatusSchema.safeParse('down').success).toBe(true);
  });
});
