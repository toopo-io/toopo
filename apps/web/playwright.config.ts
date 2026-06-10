import { defineConfig, devices } from '@playwright/test';
import {
  API_URL,
  BASE_URL,
  BETTER_AUTH_SECRET,
  DATABASE_URL,
  STORAGE_STATE,
} from './e2e/full-stack/config';

/**
 * Self-contained full-stack e2e (ADR-0022) — the reusable backbone for gated UI
 * (the complement to apps/api's 401 negative-path e2e). It owns the WHOLE stack
 * with no manual prerequisites:
 *
 *   webServer (api) → start-api.mjs: wipe + migrate a fresh DB, worker-ingest a
 *                     project graph, THEN start the Nest API (the seed runs in the
 *                     server bootstrap because Playwright starts webServers before
 *                     globalSetup, and the API connects to the DB eagerly).
 *   webServer (web) → the Next app against that API.
 *   setup           → sign up + verify + sign in (real session cookie) → storageState
 *   chromium        → run the authed spec with that session.
 *
 * One ephemeral SQLite file backs it all; ports 3000/4000 must be free.
 */
export default defineConfig({
  testDir: './e2e/full-stack',
  timeout: 90_000,
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  reporter: 'list',
  outputDir: './test-results',
  use: {
    baseURL: BASE_URL,
    viewport: { width: 1512, height: 945 },
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE },
      dependencies: ['setup'],
    },
  ],
  webServer: [
    {
      // Seeds the ephemeral DB (wipe → migrate → worker-ingest) then starts the API.
      command: 'node e2e/full-stack/start-api.mjs',
      url: `${API_URL}/v1/health`,
      reuseExistingServer: false,
      timeout: 300_000,
      env: {
        DATABASE_URL,
        BETTER_AUTH_SECRET,
        BETTER_AUTH_URL: API_URL,
        NODE_ENV: 'development',
        LOG_LEVEL: 'warn',
      },
    },
    {
      // Production build + start (no Turbopack dev flakiness; HMR-free client fetches).
      command: 'node e2e/full-stack/start-web.mjs',
      url: BASE_URL,
      reuseExistingServer: false,
      timeout: 240_000,
      env: {
        NEXT_PUBLIC_API_URL: API_URL,
        NEXT_PUBLIC_AUTH_URL: API_URL,
        NEXT_PUBLIC_DEFAULT_LOCALE: 'en',
        NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED: 'false',
      },
    },
  ],
});
