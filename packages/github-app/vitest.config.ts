import baseConfig from '@toopo/vitest-config';
import { defineConfig, mergeConfig } from 'vitest/config';

/**
 * Extends the shared vitest base with one coverage exclusion: `octokit-factory.ts`
 * is the external-SDK boundary — it constructs real `@octokit/core` clients wired
 * to `@octokit/auth-app` and adapts their generic `request` surface to our
 * {@link OctokitLike} seam. It holds no business logic (the request-building and
 * response-mapping live in the fully-tested `github-app-client.ts`, the caching in
 * `caching-github-app-auth.ts`) and is exercised by the smee.io tunnel validation
 * procedure (B5.7), not unit tests — mirroring ADR-0007's "test business code, not
 * the boundaries/scaffolding" and how the real `git` path is validated by fixtures.
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
          'src/octokit-factory.ts',
        ],
      },
    },
  }),
);
