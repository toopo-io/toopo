/**
 * Prime-directive e2e (ADR-0017): the migrated auth must work end-to-end on
 * BOTH backends. Exercises the real auth engine — built through the production
 * `createAuth` factory (Kysely adapter, additionalFields, soft-delete hook,
 * email callbacks) — over a real SQLite (libSQL temp file) and a real Postgres
 * (testcontainer), driving signup -> verify-email -> sign-in -> reset-password,
 * plus the ADR-0013 B10 soft-delete re-auth block.
 *
 * Tokens are captured from the verification / reset emails via a fake email
 * service; no network is involved.
 */
import type { Logger } from 'nestjs-pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Auth, createAuth } from '../src/modules/auth/auth.factory';
import type { AuthEmailService } from '../src/modules/auth/email/email.service';
import { type AuthBackend, SKIP_POSTGRES, startAuthBackend } from './support/auth-backend';

class FakeEmailService {
  public verifyUrl: string | null = null;
  public resetUrl: string | null = null;

  async sendVerificationEmail(input: { url: string }): Promise<void> {
    this.verifyUrl = input.url;
  }

  async sendResetPasswordEmail(input: { url: string }): Promise<void> {
    this.resetUrl = input.url;
  }
}

const noop = (): undefined => undefined;
const noopLogger = { warn: noop, error: noop, log: noop } as unknown as Logger;

function tokenFrom(url: string | null): string {
  if (url === null) {
    throw new Error('expected an email URL carrying a token, got none');
  }
  const token = new URL(url).searchParams.get('token');
  if (token === null) {
    throw new Error(`no token query param in URL: ${url}`);
  }
  return token;
}

const PASSWORD = 'correct-horse-battery-staple';
const NEW_PASSWORD = 'even-better-horse-battery-staple';

const backends = [
  { backend: 'sqlite' as const, skip: false },
  { backend: 'postgres' as const, skip: SKIP_POSTGRES },
];

for (const { backend, skip } of backends) {
  describe.skipIf(skip)(`auth flow [${backend}]`, () => {
    let harness: AuthBackend;
    let email: FakeEmailService;
    let auth: Auth;

    beforeAll(async () => {
      harness = await startAuthBackend(backend);
      email = new FakeEmailService();
      auth = createAuth(noopLogger, email as unknown as AuthEmailService, {
        betterAuthDatabase: harness.betterAuthDatabase,
        userRepository: harness.repository,
        membershipRepository: harness.membershipRepository,
      });
    }, 120_000);

    afterAll(async () => {
      await harness?.cleanup();
    });

    it('completes signup -> verify-email -> sign-in -> reset-password', async () => {
      const signUpEmail = 'flow@example.com';

      // 1. Sign up — verification required, so no session yet, but the user row
      //    is created and a verification email is sent.
      const signUp = await auth.api.signUpEmail({
        body: { email: signUpEmail, password: PASSWORD, name: 'Flow User' },
      });
      expect(signUp.user.email).toBe(signUpEmail);

      // 2. Verify email using the token from the captured verification URL.
      await auth.api.verifyEmail({ query: { token: tokenFrom(email.verifyUrl) } });

      // 3. Sign in now succeeds for the verified user.
      const signIn = await auth.api.signInEmail({
        body: { email: signUpEmail, password: PASSWORD },
      });
      expect(signIn.user.email).toBe(signUpEmail);
      expect(signIn.token).toBeTruthy();

      // Phase 1b (ADR-0028): the first session lazily provisions the user's
      // personal workspace via the session.create.before hook.
      const workspaceId = await harness.membershipRepository.findFirstWorkspaceId(signIn.user.id);
      expect(workspaceId).not.toBeNull();

      // 4. Request a password reset and complete it with the emailed token.
      email.resetUrl = null;
      await auth.api.requestPasswordReset({
        body: { email: signUpEmail, redirectTo: 'http://localhost:3000/reset' },
      });
      await auth.api.resetPassword({
        body: { newPassword: NEW_PASSWORD, token: tokenFrom(email.resetUrl) },
      });

      // The new password works; the old one no longer does.
      const afterReset = await auth.api.signInEmail({
        body: { email: signUpEmail, password: NEW_PASSWORD },
      });
      expect(afterReset.user.email).toBe(signUpEmail);

      // Idempotent: a later session reuses the same workspace — the unique
      // `user-${id}` slug guarantees provisioning never creates a duplicate.
      expect(await harness.membershipRepository.findFirstWorkspaceId(afterReset.user.id)).toBe(
        workspaceId,
      );
      await expect(
        auth.api.signInEmail({ body: { email: signUpEmail, password: PASSWORD } }),
      ).rejects.toThrow();
    });

    it('blocks re-authentication after soft-delete (ADR-0013 B10)', async () => {
      const victimEmail = 'erased@example.com';

      const signUp = await auth.api.signUpEmail({
        body: { email: victimEmail, password: PASSWORD, name: 'Erased User' },
      });
      await auth.api.verifyEmail({ query: { token: tokenFrom(email.verifyUrl) } });

      // RGPD erasure via the repository (sets deletedAt, revokes sessions).
      const { deletedAt } = await harness.repository.softDeleteUser(signUp.user.id);
      expect(deletedAt).toBeInstanceOf(Date);

      // The session.create.before hook must reject a fresh sign-in even with the
      // correct password — the canonical enforcement point for Article 17.
      await expect(
        auth.api.signInEmail({ body: { email: victimEmail, password: PASSWORD } }),
      ).rejects.toThrow();
      expect(await harness.repository.isActive(signUp.user.id)).toBe(false);
    });
  });
}
