/**
 * Full-stack positive path (ADR-0022): an authenticated viewer opens a repo's
 * cartography from the C1 explorer sidebar, on the REAL stack (migrated DB →
 * worker-ingested graph → Nest API → Next web → session cookie). The complement
 * to the negative-path 401 e2e in apps/api: this proves the authed render path
 * works end to end through the gating.
 *
 * The shell chrome itself (workspace switcher, repo list, both mapped states) is
 * covered by `c1-shell.spec.ts`; this spec owns the open-a-graph → canvas path.
 * Captures `project-graph.png` as a review artifact. Runs with the persisted
 * session state (see `auth.setup.ts`).
 */
import { expect, test } from '@playwright/test';
import { LOCALE } from './config';

test('an authenticated viewer opens a repo graph from the sidebar', async ({ page }) => {
  // The gated shell lists the instance's connected repos in the sidebar (ADR-0022
  // §5, Phase C1). The mapped repo — the one with a deterministic graph — carries
  // the exact "mapped" badge; the unmapped one reads "not mapped yet".
  await page.goto(`/${LOCALE}/projects`);
  const mappedRepo = page
    .getByRole('link')
    .filter({ has: page.getByText('mapped', { exact: true }) });
  await expect(mappedRepo).toBeVisible();

  // Opening it lands on the project-scoped graph (path carries the project id).
  await mappedRepo.click();
  await expect(page).toHaveURL(/\/projects\/[^/]+\/graph/, { timeout: 15_000 });

  // The cartography renders under auth: header, trust legend, real nodes/edges.
  await expect(page.getByRole('heading', { name: 'Cartography' })).toBeVisible();
  await expect(page.getByText('Trust', { exact: true })).toBeVisible();
  const nodes = page.locator('.react-flow__node');
  await expect(nodes.first()).toBeVisible({ timeout: 30_000 });
  expect(await nodes.count()).toBeGreaterThan(0);
  await expect(page.locator('.react-flow__edge').first()).toBeVisible();

  await page.screenshot({ path: 'test-results/project-graph.png' });
});
