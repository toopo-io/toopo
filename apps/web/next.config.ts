import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const config: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  poweredByHeader: false,
  // Emit a self-contained production server (`server.js` + traced `node_modules`)
  // for a small Docker image (ADR-0030 §2). `outputFileTracingRoot` points at the
  // monorepo root so file tracing reaches the workspace packages two levels up.
  output: 'standalone',
  outputFileTracingRoot: path.join(projectRoot, '../../'),
};

export default withNextIntl(config);
