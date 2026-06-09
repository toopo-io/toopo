import { expect, test } from '@playwright/test';

/**
 * Dogfood (ADR-0021): the blast-radius panel renders PER-HIT trust — each
 * dependent marked certainly impacted (solid) or possibly impacted (dashed), the
 * same solid/dashed language the map's edges use, replacing the old panel-level
 * caveat. Deep-links straight to the blast overlay on the most-depended-on symbol
 * of Toopo's own `@toopo/core` graph (the dogfood hot symbol — 7 certain, 4
 * possible), so the screenshot shows both kinds at once. Prerequisite: the Serve
 * API on :4000 over that populated graph (see README.md).
 */
const HOT_SYMBOL = 'src/nodes/`analysis-status.ts`/AnalysisSchema.';

test('renders per-hit certain vs possible trust on the blast-radius panel', async ({ page }) => {
  await page.goto(`/en/graph?node=${encodeURIComponent(HOT_SYMBOL)}&blast=1`);

  // The blast section paints, headed honestly, with no per-set certainty caveat.
  const panel = page.getByRole('complementary');
  await expect(panel.getByText('Impacted dependents')).toBeVisible({ timeout: 30_000 });

  // Both trust kinds are present as distinct marks — certain (solid) and possible
  // (dashed) dependents are visually separable per node (ADR-0015 §8, ADR-0021).
  // The marks appear once the blast fetch (Serve :4000) resolves.
  await expect(panel.locator('[data-trust="deterministic"]').first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(panel.locator('[data-trust="inferred"]').first()).toBeVisible({ timeout: 30_000 });
  expect(await panel.locator('[data-trust="deterministic"]').count()).toBeGreaterThan(0);
  expect(await panel.locator('[data-trust="inferred"]').count()).toBeGreaterThan(0);

  await page.screenshot({ path: 'test-results/blast-trust.png', fullPage: false });
});
