/**
 * Boots the e2e Serve API over a freshly seeded, project-scoped graph (ADR-0022).
 *
 * Playwright starts its webServers BEFORE globalSetup, and the Nest API connects
 * to the database eagerly at construction — so the seed MUST happen here, before
 * the server starts, not in globalSetup. Steps, all against the ephemeral DB the
 * webServer env points at:
 *   1. wipe + recreate the database directory (deterministic run),
 *   2. migrate explicitly (ADR-0008 — never on boot),
 *   3. worker-ingest the monorepo under the project (resolve-or-create, ADR-0022),
 *   4. start the API, inheriting the same env.
 */
import { execSync, spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error('start-api: DATABASE_URL is required (set by the Playwright webServer env)');
}

const dbDir = path.dirname(databaseUrl.replace(/^file:/, ''));
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const env = { ...process.env };
const run = (cmd) => execSync(cmd, { cwd: repoRoot, env, stdio: 'inherit' });

rmSync(dbDir, { recursive: true, force: true });
mkdirSync(dbDir, { recursive: true });

run('pnpm --filter @toopo/db exec tsx src/bin/migrate.ts');
run(
  `pnpm --filter @toopo/worker exec tsx src/cli/bin.ts ingest "${repoRoot}" ` +
    `--database-url "${databaseUrl}" --repo-host github --repo-owner toopo --repo-name toopo`,
);

const server = spawn('pnpm', ['--filter', '@toopo/api', 'dev'], {
  cwd: repoRoot,
  env,
  stdio: 'inherit',
  shell: true,
});
server.on('exit', (code) => process.exit(code ?? 0));
