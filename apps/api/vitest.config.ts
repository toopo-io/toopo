import baseConfig from '@toopo/vitest-config';
import swc from 'unplugin-swc';
import { defineConfig, mergeConfig } from 'vitest/config';

export default mergeConfig(
  baseConfig,
  defineConfig({
    plugins: [swc.vite({ module: { type: 'es6' } })],
    oxc: false,
    test: {
      environment: 'node',
      include: ['src/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
      // Provision a dummy env satisfying ApiEnvSchema before any app module
      // loads, so the suite is self-contained with no ambient env vars.
      setupFiles: ['./test/setup-env.ts'],
      globals: true,
      coverage: {
        thresholds: {
          lines: 0,
          functions: 0,
          branches: 0,
          statements: 0,
        },
      },
    },
  }),
);
