import baseConfig from '@toopo/vitest-config';
import { defineConfig, mergeConfig } from 'vitest/config';

/**
 * Extends the shared vitest base with one extra coverage exclusion:
 * `src/schema/**` (Drizzle table definitions).
 *
 * Drizzle schema files contain framework callbacks (`$onUpdate(...)`,
 * `(table) => [index(...)]`) that are not executed during unit tests —
 * Drizzle itself invokes them at INSERT/UPDATE time or during migration
 * generation. v8 coverage flags them as uncovered functions, dragging the
 * package's `functions` metric below the 80% gate even though the
 * declarative shape is the entire purpose of the file.
 *
 * Per ADR-0007 (test business code, not framework behavior), schemas are
 * excluded from coverage. Their correctness is validated by:
 *   1. Inspecting the generated migration SQL in `drizzle/migrations/`.
 *   2. End-to-end auth flows exercising the tables at runtime.
 *
 * The 80% threshold itself is left intact for the rest of the package
 * (e.g. `client.ts`), which is real business code.
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
          'src/schema/**',
        ],
      },
    },
  }),
);
