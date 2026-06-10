/**
 * Authenticated-viewer setup for the full-stack e2e (the idiomatic Playwright
 * auth pattern): sign a user up, verify them out-of-band, sign in to obtain a
 * real Better Auth session cookie, and persist the browser state for the spec.
 * It also asserts the positive API path — the instance-tenant project list
 * returns the seeded project for an authenticated caller (ADR-0022 §2, §5).
 *
 * Verification is the e2e equivalent of clicking the email link: Better Auth
 * requires `emailVerified` before issuing a session, so we flip it directly in
 * the database (the link/token round-trip is exercised in the auth unit suite).
 */

import { expect, test as setup } from '@playwright/test';
import { createAuthDatabase } from '@toopo/db';
import { sql } from 'kysely';
import { API_URL, DATABASE_URL, STORAGE_STATE, TEST_USER } from './config';

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

setup('authenticate a verified viewer and persist the session', async ({ request }) => {
  // 1) Sign up — creates the user (unverified under requireEmailVerification).
  const signUp = await request.post(`${API_URL}/v1/auth/sign-up/email`, {
    data: { email: TEST_USER.email, password: TEST_USER.password, name: TEST_USER.name },
  });
  expect(signUp.ok(), `sign-up failed: ${signUp.status()}`).toBeTruthy();

  // 2) Verify out-of-band (equivalent to clicking the verification email link).
  await markEmailVerified(TEST_USER.email);

  // 3) Sign in — verified, so a session is issued and stored on this context.
  const signIn = await request.post(`${API_URL}/v1/auth/sign-in/email`, {
    data: { email: TEST_USER.email, password: TEST_USER.password },
  });
  expect(signIn.ok(), `sign-in failed: ${signIn.status()}`).toBeTruthy();

  // 4) Positive API path: the authenticated, instance-tenant project list
  //    returns the seeded project (the picker's data source).
  const projects = await request.get(`${API_URL}/v1/projects`);
  expect(projects.ok(), `projects list failed: ${projects.status()}`).toBeTruthy();
  const body = (await projects.json()) as { items: ReadonlyArray<{ repoName: string }> };
  expect(body.items.length).toBeGreaterThan(0);
  expect(body.items.some((p) => p.repoName === 'toopo')).toBeTruthy();

  // 5) Persist the authenticated browser state for the spec.
  await request.storageState({ path: STORAGE_STATE });
});
