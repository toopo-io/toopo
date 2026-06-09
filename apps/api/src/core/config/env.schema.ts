import { baseEnvShape } from '@toopo/env';
import { z } from 'zod';

export const ApiEnvSchema = z.object({
  ...baseEnvShape,
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CORS_ORIGIN: z.string().url().default('http://localhost:3000'),

  DATABASE_URL: z
    .string()
    .url()
    .refine((v) => /^postgres(ql)?:\/\//.test(v), {
      message: 'DATABASE_URL must be a postgres:// or postgresql:// URL',
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
});
export type ApiEnv = z.infer<typeof ApiEnvSchema>;
