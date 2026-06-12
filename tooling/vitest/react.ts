import react from '@vitejs/plugin-react';
import { defineConfig, mergeConfig } from 'vitest/config';
import { baseConfig } from './base.ts';

export const reactConfig = mergeConfig(
  baseConfig,
  defineConfig({
    plugins: [react()],
    test: {
      environment: 'jsdom',
      setupFiles: ['./vitest.setup.ts'],
      // React component tests render through jsdom and await async repaints, so a
      // cold first render on a contended CI runner is legitimately slower than a
      // pure-node test. Give the per-test ceiling generous headroom above the
      // Testing Library `asyncUtilTimeout` (set in the setup file) so a slow-but-
      // correct render never collides with the blunt test timeout; an actual hang
      // still fails fast via the async-util ceiling.
      testTimeout: 15000,
    },
  }),
);

export default reactConfig;
