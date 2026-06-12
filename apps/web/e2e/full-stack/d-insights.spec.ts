/**
 * Phase D milestone capture — the Insights surface (ADR-0029) on the REAL stack,
 * over the seeded self-scan of the monorepo (a graph that genuinely carries
 * inferred edges and unresolved usages, so the trust states are real, not staged).
 *
 * Opens the mapped repo, switches to the Insights tab, and captures each of the
 * three deterministic global views — name collisions (D5), unused symbols (D6),
 * recursive cycles (D7) — in light AND dark, as section-scoped element shots. D6
 * is the trust-critical one: its card shows the "no usage detected" label, the
 * exported/non-exported fact, the certain (neutral) vs candidate (accent) split,
 * and the bare-identifier residual disclosure.
 *
 * Screenshots land in the repo-root `.design-ref/screens/` (gitignored, local) as
 * `d{5,6,7}-{collisions,unused,cycles}-{light,dark}.png`. Runs with the session.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { LOCALE } from './config';

const SCREENS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
  '.design-ref/screens',
);

/** A section card located by its heading (the cards carry no test id — ADR-0029
 *  ships no capture-only markup; the heading is the stable, user-visible anchor). */
function sectionByHeading(page: Page, name: string): Locator {
  return page.locator('section').filter({ has: page.getByRole('heading', { name }) });
}

async function capture(
  collisions: Locator,
  unused: Locator,
  cycles: Locator,
  theme: 'light' | 'dark',
): Promise<void> {
  await collisions.screenshot({ path: path.join(SCREENS_DIR, `d5-collisions-${theme}.png`) });
  await unused.screenshot({ path: path.join(SCREENS_DIR, `d6-unused-${theme}.png`) });
  await cycles.screenshot({ path: path.join(SCREENS_DIR, `d7-cycles-${theme}.png`) });
}

test('D5/D6/D7 Insights surface (light + dark)', async ({ page }) => {
  // A tall viewport so each section card fits without the main scroll container
  // clipping it — element screenshots then capture the full card (header → footer).
  await page.setViewportSize({ width: 1512, height: 3200 });
  await page.goto(`/${LOCALE}/projects`);
  await page
    .getByRole('link')
    .filter({ has: page.getByText('mapped', { exact: true }) })
    .click();
  await expect(page).toHaveURL(/\/projects\/[^/]+\/graph/, { timeout: 15_000 });

  // Switch to the Insights surface via the topbar tab.
  await page.getByRole('link', { name: 'Insights' }).click();
  await expect(page).toHaveURL(/\/projects\/[^/]+\/insights/, { timeout: 15_000 });

  const collisions = sectionByHeading(page, 'Name collisions');
  const unused = sectionByHeading(page, 'Unused symbols');
  const cycles = sectionByHeading(page, 'Recursive cycles');
  await expect(collisions).toBeVisible({ timeout: 15_000 });
  await expect(unused).toBeVisible({ timeout: 15_000 });
  await expect(cycles).toBeVisible({ timeout: 15_000 });

  // Each section fetches its own view; wait for every card to leave its loading
  // state so none is captured mid-"Loading…". The first-page reads of a monorepo
  // graph can lag under the parallel run, so give them room.
  await page.waitForLoadState('networkidle');
  for (const section of [collisions, unused, cycles]) {
    await expect(section.getByText('Loading insights…')).toHaveCount(0, { timeout: 30_000 });
  }
  await page.waitForTimeout(500);

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await capture(collisions, unused, cycles, 'light');

  await page.getByRole('button', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.waitForTimeout(400);
  await capture(collisions, unused, cycles, 'dark');
});
