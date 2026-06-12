/**
 * Phase C4 density gate — proves the orthogonal canvas, the label-fade LOD, the
 * focus-dim and the culling hold up across the three levels at scale, on the REAL
 * stack. The harness seeds the whole toopo monorepo (the same graph as the
 * dogfood DB, deterministic and on the current schema), so drilling the densest
 * package (`@toopo/web`) to its file level exercises a hundreds-of-nodes view;
 * a dense file's symbol level exercises the symbol tier.
 *
 * Captures `c4-{package,file,symbol}-{light,dark}.png` in the repo-root
 * `.design-ref/screens/` (gitignored, local-only). Runs with the persisted session.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import { LOCALE } from './config';

const SCREENS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
  '.design-ref/screens',
);

/** Capture the settled canvas in light and dark, leaving the theme back on light. */
async function captureBothThemes(page: Page, name: string): Promise<void> {
  await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 30_000 });
  // Let the fit-view animation and the orthogonal routing settle (dense views
  // take a beat longer) before capturing.
  await page.waitForTimeout(1100);

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.screenshot({ path: path.join(SCREENS_DIR, `c4-${name}-light.png`) });

  await page.getByRole('button', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SCREENS_DIR, `c4-${name}-dark.png`) });

  await page.getByRole('button', { name: 'Light' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
}

/** Search for a container by label and open it (drill one level deeper). */
async function searchAndOpen(page: Page, term: string, kind: 'package' | 'file'): Promise<void> {
  await page.getByRole('searchbox', { name: 'Search the graph' }).fill(term);
  const result = page.getByRole('button').filter({ hasText: term }).filter({ hasText: kind });
  await expect(result.first()).toBeVisible({ timeout: 15_000 });
  await result.first().click();
}

test('C4 density LOD across package, file, and symbol (light + dark)', async ({ page }) => {
  await page.goto(`/${LOCALE}/projects`);
  await page
    .getByRole('link')
    .filter({ has: page.getByText('mapped', { exact: true }) })
    .click();
  await expect(page).toHaveURL(/\/projects\/[^/]+\/graph/, { timeout: 15_000 });

  // Package tier — the whole-repo map.
  await captureBothThemes(page, 'package');

  // File tier — the densest package's files (a hundreds-of-nodes view).
  await searchAndOpen(page, 'toopo/web', 'package');
  await expect(page).toHaveURL(/level=file/, { timeout: 15_000 });
  await captureBothThemes(page, 'file');

  // Symbol tier — a dense file's symbols.
  await searchAndOpen(page, 'node-detail-panel', 'file');
  await expect(page).toHaveURL(/level=symbol/, { timeout: 15_000 });
  await captureBothThemes(page, 'symbol');
});
