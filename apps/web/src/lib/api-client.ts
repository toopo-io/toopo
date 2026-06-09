import { type HealthCheckResponse, HealthCheckResponseSchema } from '@toopo/api-contracts';
import { requestJson } from './http';

export const apiClient = {
  health: (locale?: string): Promise<HealthCheckResponse> =>
    requestJson('/v1/health', HealthCheckResponseSchema, locale),
};
