/**
 * Full-stack positive path (ADR-0022): an authenticated viewer browses the
 * project picker and opens the project-scoped cartography, on the REAL stack
 * (migrated DB → worker-ingested graph → Nest API → Next web → session cookie).
 * The complement to the negative-path 401 e2e in apps/api: this proves the
 * authed render path works end to end through the new gating.
 *
 * Captures `projects-picker.png` and `project-graph.png` as review artifacts.
 * Runs with the persisted session state (see `auth.setup.ts`).
 */
import { expect, test } from '@playwright/test';
import { LOCALE } from './config';

test('an authenticated viewer browses the picker and opens the project graph', async ({ page }) => {
  // The gated picker lists the instance's connected project (ADR-0022 §5).
  await page.goto(`/${LOCALE}/projects`);
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
  const projectCard = page.getByRole('link').filter({ hasText: 'toopo/toopo' });
  await expect(projectCard).toBeVisible();
  await page.screenshot({ path: 'test-results/projects-picker.png' });

  // Opening it lands on the project-scoped graph (path carries the project id).
  await projectCard.click();
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
