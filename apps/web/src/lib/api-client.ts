import {
  ErrorResponseSchema,
  type HealthCheckResponse,
  HealthCheckResponseSchema,
} from '@toopo/api-contracts';
import type { z } from 'zod';
import { Env } from '../../env';

async function request<TSchema extends z.ZodTypeAny>(
  path: string,
  schema: TSchema,
  locale?: string,
  init?: RequestInit,
): Promise<z.infer<TSchema>> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (locale !== undefined) {
    headers['Accept-Language'] = locale;
  }
  if (init?.body !== undefined && init.body !== null) {
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(`${Env.NEXT_PUBLIC_API_URL}${path}`, {
    ...init,
    headers: { ...headers, ...init?.headers },
  });
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const parsed = ErrorResponseSchema.safeParse(payload);
    if (parsed.success) {
      throw new Error(parsed.data.message);
    }
    throw new Error(`API ${path} failed: ${response.status}`);
  }
  const json: unknown = await response.json();
  return schema.parse(json);
}

export const apiClient = {
  health: (locale?: string): Promise<HealthCheckResponse> =>
    request('/v1/health', HealthCheckResponseSchema, locale),
};
