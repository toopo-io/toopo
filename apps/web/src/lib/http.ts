/**
 * The shared fetch core for every Serve read-API call. One place owns the base
 * URL, the locale header, error-envelope decoding (ADR-0020 error contract), and
 * — crucially — Zod validation of the response against the api-contracts schema
 * (ADR-0006: never trust external data; validate at the boundary). Feature
 * clients (`api-client`, `graph/api`) compose this; they never call `fetch`.
 */
import { ErrorResponseSchema } from '@toopo/api-contracts';
import type { z } from 'zod';
import { Env } from '../../env';
import { resolveApiBaseUrl } from './api-base';

export async function requestJson<TSchema extends z.ZodTypeAny>(
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
  const response = await fetch(`${resolveApiBaseUrl(Env.NEXT_PUBLIC_API_URL)}${path}`, {
    // The Serve API is gated (ADR-0022 §5), so the session cookie must ride along.
    // `credentials: include` covers browser calls; a server component forwards the
    // cookie explicitly via `init.headers` (no cookie jar exists server-side).
    credentials: 'include',
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
