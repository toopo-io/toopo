import { inferBackend } from '@toopo/db';
import { baseEnvShape } from '@toopo/env';
import { z } from 'zod';

export const ApiEnvSchema = z.object({
  ...baseEnvShape,
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CORS_ORIGIN: z.string().url().default('http://localhost:3000'),

  // The backend is inferred from the scheme (ADR-0017 §1): postgres(ql):// for
  // cloud, libsql://|sqlite://|file: for self-host. Validated with a custom
  // refine — not .url() — because libSQL's file: and :memory: forms are not
  // standard URLs.
  DATABASE_URL: z
    .string()
    .trim()
    .min(1)
    .refine((value) => inferBackend(value) !== null, {
      message:
        'DATABASE_URL must use a known scheme: postgres://, postgresql://, libsql://, sqlite://, file:, or :memory:',
    }),

  BETTER_AUTH_SECRET: z.string().min(32, {
    message:
      'BETTER_AUTH_SECRET must be at least 32 characters (generate with: openssl rand -base64 32)',
  }),
  BETTER_AUTH_URL: z.string().url(),

  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_FROM_EMAIL: z.string().email().default('onboarding@resend.dev'),
  RESEND_FROM_NAME: z.string().min(1).default('Toopo'),

  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),

  // The GitHub-App webhook secret (ADR-0024 §3). Optional: a self-host with no
  // GitHub App still boots (graceful degradation), and the webhook route fails
  // closed (503) when it is unset — it never accepts an unsigned request. When
  // present it must be at least 16 characters.
  GITHUB_WEBHOOK_SECRET: z.string().min(16).optional(),
});
export type ApiEnv = z.infer<typeof ApiEnvSchema>;
