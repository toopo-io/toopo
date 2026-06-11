/**
 * Authenticated-viewer setup for the full-stack e2e (the idiomatic Playwright
 * auth pattern) — and the graph seed, which must run here under ADR-0028 §4.
 *
 * Order matters: sign the viewer up, verify out-of-band, sign in (the session
 * hook lazily provisions their personal workspace and makes it active), THEN
 * ingest the repo under that workspace via the worker CLI. Only now does the
 * active-workspace-scoped project list (ADR-0028 §4) return the seeded project,
 * which we assert before persisting the browser state for the spec.
 *
 * Verification is the e2e equivalent of clicking the email link: Better Auth
 * requires `emailVerified` before issuing a session, so we flip it directly in
 * the database (the link/token round-trip is exercised in the auth unit suite).
 */

import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test as setup } from '@playwright/test';
import { createAuthDatabase, createProjectDatabase } from '@toopo/db';
import { sql } from 'kysely';
import { API_URL, DATABASE_URL, REPO, STORAGE_STATE, TEST_USER } from './config';

/** A second connected repo deliberately left WITHOUT a graph, so the shell shows
 *  the "not mapped yet" state alongside the mapped one (both deterministic). */
const UNMAPPED_REPO = 'pending-app';

async function markEmailVerified(email: string): Promise<void> {
  const handle = createAuthDatabase({ databaseUrl: DATABASE_URL });
  try {
    await sql`update "user" set "emailVerified" = 1 where "email" = ${email}`.execute(
      handle.betterAuthDatabase.db,
    );
  } finally {
    await handle.close();
  }
}

/**
 * The viewer's lazily-provisioned personal workspace (ADR-0028 §2), set active by
 * the session-create hook on sign-in. The project is ingested under it so the
 * active-workspace-scoped list (ADR-0028 §4) returns it. Null if none exists
 * (a provisioning miss the caller treats as fatal).
 */
async function readPersonalWorkspaceId(userId: string): Promise<string | null> {
  const handle = createAuthDatabase({ databaseUrl: DATABASE_URL });
  try {
    const result = await sql<{ organizationId: string }>`
      select "organizationId" from "member"
      where "userId" = ${userId}
      order by "createdAt" asc
      limit 1
    `.execute(handle.betterAuthDatabase.db);
    return result.rows[0]?.organizationId ?? null;
  } finally {
    await handle.close();
  }
}

/**
 * Ingest the monorepo under the viewer's workspace (resolve-or-create the
 * project, ADR-0022; the workspace must already exist, ADR-0028). Synchronous —
 * the spec must not start until the graph is present.
 */
function ingestRepoUnderWorkspace(workspaceId: string, ownerUserId: string): void {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
  execSync(
    `pnpm --filter @toopo/worker exec tsx src/cli/bin.ts ingest "${repoRoot}" ` +
      `--database-url "${DATABASE_URL}" --repo-host ${REPO.host} --repo-owner ${REPO.owner} ` +
      `--repo-name ${REPO.name} --workspace-id "${workspaceId}" --owner-user-id "${ownerUserId}"`,
    { cwd: repoRoot, stdio: 'inherit' },
  );
}

/**
 * Create a second connected repo with NO graph under the same workspace, so the
 * shell renders both deterministic mapped-states: `toopo` (mapped) and this one
 * ("not mapped yet"). Created directly (not ingested) — "unmapped" means no graph.
 */
async function seedUnmappedProject(workspaceId: string, ownerUserId: string): Promise<void> {
  const handle = createProjectDatabase({ databaseUrl: DATABASE_URL });
  try {
    await handle.projectRepository.createProject({
      ownerUserId,
      workspaceId,
      repoHost: REPO.host,
      repoOwner: REPO.owner,
      repoName: UNMAPPED_REPO,
      installationId: null,
    });
  } finally {
    await handle.close();
  }
}

setup(
  'authenticate a verified viewer, seed the graph, and persist the session',
  async ({ request }) => {
    // The worker ingest parses the whole monorepo — well beyond the default
    // per-test timeout — so widen it for this one seeding step.
    setup.setTimeout(300_000);

    // 1) Sign up — creates the user (unverified under requireEmailVerification).
    const signUp = await request.post(`${API_URL}/v1/auth/sign-up/email`, {
      data: { email: TEST_USER.email, password: TEST_USER.password, name: TEST_USER.name },
    });
    expect(signUp.ok(), `sign-up failed: ${signUp.status()}`).toBeTruthy();

    // 2) Verify out-of-band (equivalent to clicking the verification email link).
    await markEmailVerified(TEST_USER.email);

    // 3) Sign in — verified, so a session is issued and the session hook provisions
    //    + activates the viewer's personal workspace; the cookie lands on this context.
    const signIn = await request.post(`${API_URL}/v1/auth/sign-in/email`, {
      data: { email: TEST_USER.email, password: TEST_USER.password },
    });
    expect(signIn.ok(), `sign-in failed: ${signIn.status()}`).toBeTruthy();
    const userId = ((await signIn.json()) as { user?: { id?: string } }).user?.id;
    expect(userId, 'sign-in did not return a user id').toBeTruthy();

    // 4) Seed: ingest the repo under the viewer's now-active workspace, so the
    //    active-workspace-scoped list (ADR-0028 §4) returns it.
    const workspaceId = await readPersonalWorkspaceId(userId as string);
    expect(workspaceId, 'no personal workspace was provisioned for the viewer').toBeTruthy();
    ingestRepoUnderWorkspace(workspaceId as string, userId as string);
    // A second, deliberately-unmapped repo so the shell shows both trust states.
    await seedUnmappedProject(workspaceId as string, userId as string);

    // 5) Positive API path: the authenticated, active-workspace project list
    //    returns the seeded project (the picker's data source, ADR-0028 §4).
    const projects = await request.get(`${API_URL}/v1/projects`);
    expect(projects.ok(), `projects list failed: ${projects.status()}`).toBeTruthy();
    const body = (await projects.json()) as { items: ReadonlyArray<{ repoName: string }> };
    expect(body.items.some((p) => p.repoName === REPO.name)).toBeTruthy();

    // 6) Persist the authenticated browser state for the spec.
    await request.storageState({ path: STORAGE_STATE });
  },
);
