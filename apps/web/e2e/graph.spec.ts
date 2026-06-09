import { expect, test } from '@playwright/test';

/**
 * Dogfood: the cartography rendered over a real, worker-populated graph (Toopo's
 * own, by default). Verifies the V1 map paints end to end — the Serve API → the
 * adapters → ELK → React Flow — with trust visible (the legend) and real
 * container nodes and edges on the canvas. Captures a screenshot artifact so the
 * visual direction can be reviewed. Prerequisite: the Serve API on :4000 over a
 * populated graph (see README.md).
 */
test('renders the cartography map over the populated graph', async ({ page }) => {
  await page.goto('/en/graph');

  // The page header and the persistent trust legend are always present.
  await expect(page.getByRole('heading', { name: 'Cartography' })).toBeVisible();
  await expect(page.getByText('Trust', { exact: true })).toBeVisible();
  await expect(page.getByText('Deterministic — statically proven')).toBeVisible();
  await expect(page.getByText('Inferred — a heuristic guess')).toBeVisible();

  // The map must render real container nodes from the graph (not the empty state).
  const nodes = page.locator('.react-flow__node');
  await expect(nodes.first()).toBeVisible({ timeout: 30_000 });
  expect(await nodes.count()).toBeGreaterThan(0);

  // Edges are drawn (the dependency relationships between containers).
  await expect(page.locator('.react-flow__edge').first()).toBeVisible();

  await page.screenshot({ path: 'test-results/graph-map.png', fullPage: false });
});
