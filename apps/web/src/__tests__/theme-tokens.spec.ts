import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Structural guard for the Minimal design's theming contract (Phase C0). Theming
 * is attribute-driven (next-themes `data-theme`), NOT OS-driven — so neither the
 * shared token sheet nor the graph palette may fall back to `prefers-color-scheme`,
 * which would silently diverge from the persisted toggle. The one saturated accent
 * is the inferred-trust signal, locked to the design's values. These are the parts
 * a future edit could regress without any type or render test noticing.
 */
const here = dirname(fileURLToPath(import.meta.url));
const baseCss = readFileSync(resolve(here, '../../../../tooling/tailwind/base.css'), 'utf8');
const graphCss = readFileSync(resolve(here, '../app/[locale]/graph/graph.css'), 'utf8');

describe('shared theme tokens', () => {
  it('themes by the data-theme attribute, never the OS colour scheme', () => {
    expect(baseCss).toContain('[data-theme="dark"]');
    expect(baseCss).not.toContain('@media (prefers-color-scheme');
    expect(graphCss).not.toContain('@media (prefers-color-scheme');
  });

  it('locks the inferred-trust accent to the design values in both themes', () => {
    expect(baseCss).toContain('--tp-inferred: #e0640f');
    expect(baseCss).toContain('--tp-inferred: #f0883e');
  });

  it('keeps the graph trust palette data-driven off the design tokens', () => {
    expect(graphCss).toContain('var(--tp-certain)');
    expect(graphCss).toContain('var(--tp-inferred)');
  });
});
