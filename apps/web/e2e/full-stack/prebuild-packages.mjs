/**
 * Builds the internal package closure (`./packages/*`) ONCE, before the
 * full-stack harness boots either server.
 *
 * Determinism (ADR-0025 spirit — a result must depend on source, never on a
 * pre-existing artifact): Playwright starts its `webServer`s BEFORE `globalSetup`
 * (see e2e/README.md), and the API is launched through `@toopo/api dev` (tsx —
 * no build step). Without this, the API resolves workspace dependencies such as
 * `@toopo/api-contracts` from a STALE `./dist`, making a harness result depend on
 * a leftover build artifact instead of the current source. Building here closes
 * that drift; Turbo's content-hash cache makes the second start-*.mjs process a
 * no-op, so importing this from both servers costs one build, not two.
 *
 * Turbo's JS bin is run directly under `node` with argv passed as an array (no
 * shell), so the `./packages/*` filter never reaches a shell: POSIX `sh` would
 * pathname-expand it into many arguments and Windows `cmd` would not — running
 * shell-free hands the filter to Turbo verbatim on every OS.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

function resolveTurboBin() {
  const packageJsonPath = require.resolve('turbo/package.json');
  const { bin } = require(packageJsonPath);
  const binRelative = typeof bin === 'string' ? bin : bin.turbo;
  return path.resolve(path.dirname(packageJsonPath), binRelative);
}

export function prebuildWorkspacePackages() {
  execFileSync(process.execPath, [resolveTurboBin(), 'run', 'build', '--filter=./packages/*'], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
}
