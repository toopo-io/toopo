/**
 * Test-env provisioning (test-side only). Satisfies `ApiEnvSchema`
 * (src/core/config/env.schema.ts) with dummy values BEFORE any app module loads,
 * so every apps/api test runs with no ambient environment. Wired as a vitest
 * `setupFiles` entry, which executes before the test files (and their import
 * chain through `src/env.ts`) are evaluated.
 *
 * This does NOT weaken production validation: `createEnvValidator` still runs and
 * still fails fast (ADR-0008); this only populates `process.env` for the test
 * process. Values are set only when absent, so a CI- or shell-provided env always
 * wins. The real auth backend comes from the testcontainers/libSQL harness and
 * emails use the fake email service, so these placeholders are never used to
 * reach a real service — they exist solely to pass schema validation at import.
 */
const TEST_ENV: Readonly<Record<string, string>> = {
  NODE_ENV: 'test',
  // Any valid SQLite scheme satisfies the DATABASE_URL refine; the e2e supplies
  // its own real test database via the harness, never this value.
  DATABASE_URL: ':memory:',
  // >= 32 chars to satisfy the BETTER_AUTH_SECRET minimum.
  BETTER_AUTH_SECRET: 'test-only-better-auth-secret-0123456789abcdef',
  BETTER_AUTH_URL: 'http://localhost:4000',
};

for (const [key, value] of Object.entries(TEST_ENV)) {
  process.env[key] ??= value;
}
