import { z } from 'zod';

export const HealthStatusSchema = z.enum(['ok', 'degraded', 'down']);
export type HealthStatus = z.infer<typeof HealthStatusSchema>;

export const HealthCheckResponseSchema = z.object({
  status: HealthStatusSchema,
  timestamp: z.iso.datetime(),
  uptime: z.number().nonnegative(),
  version: z.string().min(1),
});
export type HealthCheckResponse = z.infer<typeof HealthCheckResponseSchema>;

export const HealthCheckRequestSchema = z.object({}).strict();
export type HealthCheckRequest = z.infer<typeof HealthCheckRequestSchema>;
