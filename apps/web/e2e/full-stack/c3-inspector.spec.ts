/**
 * Phase C3 milestone proof — the node inspector spec-list, on the REAL stack.
 * Opens the mapped repo's graph, searches for a known symbol and opens its detail
 * panel, and captures it in light AND dark for the design reference. The panel
 * composes the signature, JSDoc, parameters, callers/callees and call-site
 * bindings from the served NodeDetail/CallBindings/declarations (ADR-0020 §5).
 *
 * Searching for a symbol is the deterministic way in: choosing a symbol result
 * opens its panel in place (searchJumpState), with no dependence on which node
 * the layout happens to place first. `GraphExplorer` is one of the repo's own
 * components, so the seeded self-scan always contains it.
 *
 * Screenshots land in the repo-root `.design-ref/screens/` (gitignored, local-only)
 * as `c3-inspector-{light,dark}.png`. Runs with the persisted session.
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

test('C3 node inspector spec-list (light + dark)', async ({ page }) => {
  await page.goto(`/${LOCALE}/projects`);
  await page
    .getByRole('link')
    .filter({ has: page.getByText('mapped', { exact: true }) })
    .click();
  await expect(page).toHaveURL(/\/projects\/[^/]+\/graph/, { timeout: 15_000 });
  await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 30_000 });

  // Search for a known symbol and open it — choosing a symbol result opens its
  // detail panel directly, independent of the layout order.
  await page.getByRole('searchbox', { name: 'Search the graph' }).fill('GraphExplorer');
  const symbolResult = page
    .getByRole('button')
    .filter({ hasText: 'GraphExplorer' })
    .filter({ hasText: 'symbol' });
  await expect(symbolResult.first()).toBeVisible({ timeout: 15_000 });
  await symbolResult.first().click();

  // The inspector panel opens with the symbol's spec-list.
  const panel = page.getByRole('complementary');
  await expect(panel).toBeVisible({ timeout: 15_000 });
  await expect(panel.getByText('Parameters')).toBeVisible();
  await expect(panel.getByText('Callers')).toBeVisible();
  await page.waitForTimeout(400);

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.screenshot({ path: path.join(SCREENS_DIR, 'c3-inspector-light.png') });

  await page.getByRole('button', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SCREENS_DIR, 'c3-inspector-dark.png') });
});
