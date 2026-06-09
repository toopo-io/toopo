import baseConfig from '@toopo/vitest-config';
import { defineConfig, mergeConfig } from 'vitest/config';

/**
 * Extends the shared vitest base with coverage exclusions for non-business
 * code: the thin maintainer/runtime entrypoints under `src/bin/**` and the
 * test-only dual-backend harness under `src/test-support/**` (ADR-0007 — test
 * business code, not thin shells or test scaffolding).
 */
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      coverage: {
        exclude: [
          'src/**/*.{test,spec}.{ts,tsx}',
          'src/**/*.d.ts',
          'src/**/index.ts',
          'src/bin/**',
          'src/test-support/**',
        ],
      },
    },
  }),
);
