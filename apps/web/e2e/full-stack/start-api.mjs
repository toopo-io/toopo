/**
 * Boots the e2e Serve API over a freshly migrated, EMPTY database (ADR-0022).
 *
 * Playwright starts its webServers before the setup project, and the Nest API
 * connects to the database eagerly at construction — so the schema MUST exist
 * before the server starts. Steps, against the ephemeral DB the webServer env
 * points at:
 *   1. wipe + recreate the database directory (deterministic run),
 *   2. migrate explicitly (ADR-0008 — never on boot),
 *   3. start the API, inheriting the same env.
 *
 * The graph is NOT seeded here. Under active-workspace scoping (ADR-0028 §4) the
 * project must be ingested under the viewer's OWN workspace, which only exists
 * once the viewer has signed in (the session hook provisions it lazily) — so the
 * worker ingest moved to `auth.setup.ts`, after that workspace is provisioned.
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

rmSync(dbDir, { recursive: true, force: true });
mkdirSync(dbDir, { recursive: true });

execSync('pnpm --filter @toopo/db exec tsx src/bin/migrate.ts', {
  cwd: repoRoot,
  env,
  stdio: 'inherit',
});

const server = spawn('pnpm', ['--filter', '@toopo/api', 'dev'], {
  cwd: repoRoot,
  env,
  stdio: 'inherit',
  shell: true,
});
server.on('exit', (code) => process.exit(code ?? 0));
