/**
 * Phase C1 milestone proof — the workspace-aware explorer shell on the REAL stack
 * (migrated DB → seeded graph → Nest API → Next web → session cookie). Renders the
 * shell at `/projects`: the workspace switcher, the repository list with BOTH
 * deterministic trust states (a mapped repo and a "not mapped yet" one, never
 * fabricated), and captures it in light AND dark for the design reference.
 *
 * Screenshots land in the repo-root `.design-ref/screens/` (gitignored, local-only)
 * as `c1-shell-{light,dark}.png`. Runs with the persisted session (auth.setup.ts).
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

test('C1 shell renders the workspace switcher, repos, and both trust states (light + dark)', async ({
  page,
}) => {
  await page.goto(`/${LOCALE}/projects`);

  // Shell chrome: the workspace section + repository list (the picker folded in).
  await expect(page.getByText('Workspace', { exact: true })).toBeVisible();
  await expect(page.getByText('Repositories', { exact: true })).toBeVisible();
  // The active personal workspace surfaces in the switcher/breadcrumb.
  await expect(page.getByText('Personal').first()).toBeVisible();
  // Both deterministic mapped-states, never a guess: one mapped, one not.
  await expect(page.getByText('mapped', { exact: true })).toBeVisible();
  await expect(page.getByText('not mapped yet', { exact: true })).toBeVisible();

  // Light is the product default; capture it, then flip to dark via the real toggle.
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.screenshot({ path: path.join(SCREENS_DIR, 'c1-shell-light.png') });

  await page.getByRole('button', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: path.join(SCREENS_DIR, 'c1-shell-dark.png') });
});
