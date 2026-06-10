/**
 * Boots the e2e web app as a PRODUCTION server (ADR-0022 harness). The Next dev
 * server (Turbopack) is flaky compiling routes on-demand under Playwright and
 * aborts in-flight client fetches on Fast Refresh (see e2e/README.md); the
 * production build is deterministic and HMR-free. NEXT_PUBLIC_* are baked at
 * build time from the webServer env, so the app points at the e2e API.
 */
import { execSync, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const env = { ...process.env };

execSync('pnpm --filter @toopo/web build', { cwd: repoRoot, env, stdio: 'inherit' });

const server = spawn('pnpm', ['--filter', '@toopo/web', 'start'], {
  cwd: repoRoot,
  env,
  stdio: 'inherit',
  shell: true,
});
server.on('exit', (code) => process.exit(code ?? 0));
