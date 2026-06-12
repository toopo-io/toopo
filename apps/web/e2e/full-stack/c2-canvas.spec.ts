/**
 * Phase C2 milestone proof — the orthogonal cartography canvas with trust-split
 * edges, on the REAL stack (migrated DB → seeded graph → Nest API → Next web →
 * session cookie). Opens the mapped repo's graph from the C1 sidebar, waits for
 * the ELK-laid-out canvas (nodes, orthogonal edges, legend, level switcher, stat
 * bar) and captures it in light AND dark for the design reference.
 *
 * Screenshots land in the repo-root `.design-ref/screens/` (gitignored, local-only)
 * as `c2-canvas-{light,dark}.png`. Runs with the persisted session (auth.setup.ts).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { LOCALE } from './config';

const SCREENS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
  '.design-ref/screens',
);

test('C2 cartography canvas — orthogonal trust-split edges (light + dark)', async ({ page }) => {
  await page.goto(`/${LOCALE}/projects`);
  const mappedRepo = page
    .getByRole('link')
    .filter({ has: page.getByText('mapped', { exact: true }) });
  await mappedRepo.click();
  await expect(page).toHaveURL(/\/projects\/[^/]+\/graph/, { timeout: 15_000 });

  // The laid-out cartography: header, real nodes/edges, and the C2 chrome.
  await expect(page.getByRole('heading', { name: 'Cartography' })).toBeVisible();
  await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.react-flow__edge').first()).toBeVisible();
  await expect(page.getByRole('toolbar', { name: 'Containment level' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Isolate inferred' })).toBeVisible();
  // Let the fit-view animation and the orthogonal routes settle before capture.
  await page.waitForTimeout(800);

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.screenshot({ path: path.join(SCREENS_DIR, 'c2-canvas-light.png') });

  await page.getByRole('button', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SCREENS_DIR, 'c2-canvas-dark.png') });
});
