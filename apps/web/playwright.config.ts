import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config for the cartography dogfood (ADR-0020 S0 infra). The web dev server
 * is started/reused by Playwright; the Serve API (port 4000) over a populated
 * graph is a PREREQUISITE — see `e2e/README.md` for the worker-populate → api →
 * web chain. Kept separate from Vitest (which owns `src/**`); Playwright owns
 * `e2e/**`.
 */
const PORT = 3000;
const BASE_URL = process.env['E2E_BASE_URL'] ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
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
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev',
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
