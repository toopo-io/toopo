/**
 * The webhook-secret env rule (ADR-0024 §3): GITHUB_WEBHOOK_SECRET is optional
 * (a self-host without a GitHub App still validates), but when present it must be
 * at least 16 characters. The rest of ApiEnvSchema is covered by the env package.
 */
import { describe, expect, it } from 'vitest';
import { ApiEnvSchema } from './env.schema';

const BASE_ENV = {
  NODE_ENV: 'test',
  DATABASE_URL: ':memory:',
  BETTER_AUTH_SECRET: 'test-only-better-auth-secret-0123456789abcdef',
  BETTER_AUTH_URL: 'http://localhost:4000',
} as const;

describe('ApiEnvSchema — GITHUB_WEBHOOK_SECRET', () => {
  it('validates when the secret is absent (optional — self-host without a GitHub App boots)', () => {
    const result = ApiEnvSchema.safeParse({ ...BASE_ENV });
    expect(result.success).toBe(true);
    expect(result.success && result.data.GITHUB_WEBHOOK_SECRET).toBeUndefined();
  });

  it('accepts a secret of at least 16 characters', () => {
    const result = ApiEnvSchema.safeParse({
      ...BASE_ENV,
      GITHUB_WEBHOOK_SECRET: 'a'.repeat(16),
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.GITHUB_WEBHOOK_SECRET).toBe('a'.repeat(16));
  });

  it('rejects a secret shorter than 16 characters', () => {
    const result = ApiEnvSchema.safeParse({
      ...BASE_ENV,
      GITHUB_WEBHOOK_SECRET: 'tooshort',
    });
    expect(result.success).toBe(false);
  });
});
