/**
 * Trust-inversion proof — the inferred (heuristic) path must be PROVEN to render,
 * never assumed. The seeded toopo self-scan genuinely carries resolution:'inferred'
 * edges (member-call resolutions such as `AnalysisSchema.optional()` →
 * `AnalysisSchema`), so this captures them on both surfaces:
 *
 *  - the canvas, at @toopo/core's file level, where the inferred file→file edges
 *    render as the accent dashed stroke (the orange trust hue), and
 *  - the inspector, opening a schema symbol that is the target of an inferred
 *    call, where the plain-language inferred callout fires and the caller reads
 *    in the accent.
 *
 * Captures `c2-inferred-{light,dark}.png` (canvas) and `c3-inferred-{light,dark}.png`
 * (inspector) in the repo-root `.design-ref/screens/`. Runs with the persisted session.
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

async function captureBothThemes(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(800);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.screenshot({ path: path.join(SCREENS_DIR, `${name}-light.png`) });
  await page.getByRole('button', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SCREENS_DIR, `${name}-dark.png`) });
  await page.getByRole('button', { name: 'Light' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
}

test('trust-inversion renders on the canvas and in the inspector (light + dark)', async ({
  page,
}) => {
  await page.goto(`/${LOCALE}/projects`);
  await page
    .getByRole('link')
    .filter({ has: page.getByText('mapped', { exact: true }) })
    .click();
  await expect(page).toHaveURL(/\/projects\/[^/]+\/graph/, { timeout: 15_000 });
  await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 30_000 });

  const search = page.getByRole('searchbox', { name: 'Search the graph' });

  // Canvas — @toopo/core's file level genuinely carries inferred (dashed accent)
  // file→file edges. Assert the honest count is non-zero before capturing.
  await search.fill('toopo/core');
  await page
    .getByRole('button')
    .filter({ hasText: 'toopo/core' })
    .filter({ hasText: 'package' })
    .first()
    .click();
  await expect(page).toHaveURL(/level=file/, { timeout: 15_000 });
  await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('text=/[1-9]\\d* inferred/')).toBeVisible({ timeout: 15_000 });
  await captureBothThemes(page, 'c2-inferred');

  // Inspector — a schema symbol that is the target of an inferred member-call
  // shows the plain-language callout and an accent (dashed) caller row.
  await search.fill('AnalysisSchema');
  await page
    .getByRole('button')
    .filter({ hasText: 'AnalysisSchema' })
    .filter({ hasText: 'symbol' })
    .first()
    .click();
  const panel = page.getByRole('complementary');
  await expect(panel).toBeVisible({ timeout: 15_000 });
  await expect(
    panel.getByText('Some relationships here are inferred', { exact: false }),
  ).toBeVisible({ timeout: 15_000 });
  await captureBothThemes(page, 'c3-inferred');
});
