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
