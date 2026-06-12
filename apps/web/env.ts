import { baseEnvShape, createEnvValidator } from '@toopo/env';
import { z } from 'zod';

const WebEnvSchema = z.object({
  ...baseEnvShape,
  NEXT_PUBLIC_API_URL: z.string().url(),
  NEXT_PUBLIC_AUTH_URL: z.string().url(),
  // Server-only (NOT NEXT_PUBLIC_*, so it never enters the client bundle): the
  // API origin as seen from the web server for SSR fetches. Optional — unset
  // means server fetches use the public origin. See ADR-0030 §3 and api-base.ts.
  INTERNAL_API_URL: z.string().url().optional(),
  NEXT_PUBLIC_DEFAULT_LOCALE: z.string().min(2).max(5).default('en'),
  NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

export const Env = createEnvValidator(WebEnvSchema)({
  NODE_ENV: process.env.NODE_ENV,
  LOG_LEVEL: process.env['LOG_LEVEL'],
  NEXT_PUBLIC_API_URL: process.env['NEXT_PUBLIC_API_URL'],
  NEXT_PUBLIC_AUTH_URL: process.env['NEXT_PUBLIC_AUTH_URL'],
  INTERNAL_API_URL: process.env['INTERNAL_API_URL'],
  NEXT_PUBLIC_DEFAULT_LOCALE: process.env['NEXT_PUBLIC_DEFAULT_LOCALE'],
  NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED: process.env['NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED'],
});
