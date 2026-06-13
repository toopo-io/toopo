/**
 * Shared configuration for the self-contained full-stack e2e (ADR-0022). One
 * ephemeral SQLite file backs the whole stack; the API and web servers and the
 * auth setup (which signs the viewer in and seeds the graph) all agree on it via
 * these constants. Everything here is throwaway and local — the "secret" guards
 * nothing.
 */
import os from 'node:os';
import path from 'node:path';

const dbFile = path.join(os.tmpdir(), 'toopo-fullstack-e2e', 'graph.db');

/** The libSQL file URL shared by the servers and the seeders (absolute, posix). */
export const DATABASE_URL = `file:${dbFile.split(path.sep).join('/')}`;

const API_PORT = 4000;
const WEB_PORT = 3000;
export const API_URL = `http://localhost:${API_PORT}`;
export const BASE_URL = `http://localhost:${WEB_PORT}`;
export const LOCALE = 'en';

/** Test-only Better Auth secret (≥32 chars). Ephemeral; not a real credential. */
export const BETTER_AUTH_SECRET = 'toopo-full-stack-e2e-secret-do-not-use-anywhere';

/** The repo the worker connects + ingests as the project under test. */
export const REPO = { host: 'github', owner: 'toopo', name: 'toopo' } as const;

/** The viewer signed in for the positive path; the graph is seeded under their
 *  personal workspace, which the active-workspace-scoped list returns (ADR-0028 §4). */
export const TEST_USER = {
  email: 'e2e-viewer@toopo.test',
  password: 'Sup3r-Secret-Passw0rd!',
  name: 'E2E Viewer',
} as const;

/** Where the authenticated browser state is persisted between the setup and the spec. */
export const STORAGE_STATE = path.join(process.cwd(), 'test-results', 'fullstack-auth.json');
