import baseConfig from '@toopo/vitest-config';
import { defineConfig, mergeConfig } from 'vitest/config';

/**
 * Extends the shared vitest base with coverage exclusions for non-business code:
 * the test-only dual-backend harness under `src/test-support/**` (the libSQL
 * temp-file + Postgres testcontainer provisioning reused across the cross-backend
 * proofs), per ADR-0007 — test business code, not test scaffolding.
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
          'src/test-support/**',
        ],
      },
    },
  }),
);
