import {
  authSchemaOptions,
  buildOrganizationPlugin,
  PERSONAL_WORKSPACE_NAME,
  personalWorkspaceSlug,
} from '@toopo/db';
import { negotiateLocale } from '@toopo/i18n';
import { betterAuth } from 'better-auth';
import type { Logger } from 'nestjs-pino';
import { Env } from '../../env';
import type { DatabaseService } from '../database/database.module';
import { createSessionCreateBeforeHook } from './auth.soft-delete-guard';
import type { AuthEmailService } from './email/email.service';
import { createSendInvitationEmail } from './email/invitation-hook';
import { buildResetPasswordUrl, buildVerifyEmailUrl } from './email/url-builders';
import { createEnsureActiveWorkspace } from './workspace-provisioning';

export type Auth = ReturnType<typeof createAuth>;

/** The persistence surface the auth instance needs (from @toopo/db, F4). */
type AuthDatabaseDeps = Pick<
  DatabaseService,
  'betterAuthDatabase' | 'userRepository' | 'membershipRepository'
>;

export function createAuth(logger: Logger, email: AuthEmailService, database: AuthDatabaseDeps) {
  const sessionCreateBefore = createSessionCreateBeforeHook({
    logger,
    getUserDeletedAt: (userId) => database.userRepository.findDeletedAt(userId),
  });

  const googleClientId = Env.GOOGLE_CLIENT_ID;
  const googleClientSecret = Env.GOOGLE_CLIENT_SECRET;
  const googleSocial =
    googleClientId !== undefined && googleClientSecret !== undefined
      ? { google: { clientId: googleClientId, clientSecret: googleClientSecret } }
      : undefined;

  // Better Auth on its built-in Kysely adapter over the shared connection
  // (ADR-0017 §3). The schema is generated from the installed better-auth and
  // committed as migrations, so there is no hand-written schema to drift; the
  // CI drift-check guards it. `authSchemaOptions` carries the deletedAt RGPD
  // field extension (ADR-0013) — the single source shared with the migration
  // generator, so the running schema and the committed migrations never differ.
  // Lazy personal-workspace provisioning (ADR-0028, Phase 1b). The
  // `createPersonalWorkspace` callback closes over `auth` declared below; it only
  // runs at request time, long after construction, so this forward reference is a
  // deferred closure — never a use-before-init. The fail-soft + race-safe contract
  // lives in the policy module and is unit-tested there.
  const ensureActiveWorkspace = createEnsureActiveWorkspace({
    findFirstWorkspaceId: (userId) => database.membershipRepository.findFirstWorkspaceId(userId),
    createPersonalWorkspace: async (userId) => {
      const created = await auth.api.createOrganization({
        body: {
          name: PERSONAL_WORKSPACE_NAME,
          slug: personalWorkspaceSlug(userId),
          userId,
          keepCurrentActiveOrganization: true,
        },
      });
      return created?.id ?? null;
    },
    logger,
  });

  const auth = betterAuth({
    ...authSchemaOptions,
    database: database.betterAuthDatabase,
    secret: Env.BETTER_AUTH_SECRET,
    baseURL: Env.BETTER_AUTH_URL,
    basePath: '/v1/auth',
    trustedOrigins: [Env.CORS_ORIGIN],
    // Explicit, deterministic rate limiting on the auth surface: ON in
    // production — never left to the library's implicit NODE_ENV default — and
    // OFF in development/test so local flows and the e2e suites stay
    // deterministic. Enabling it activates Better Auth's hardened per-path
    // rules (sign-in/sign-up 3 per 10 s, password-reset/OTP 3 per 60 s) on top
    // of this base window. The default in-memory counters fit the
    // single-instance self-host topology (ADR-0030); a multi-instance
    // deployment must switch `storage` to the database or a secondary store.
    rateLimit: {
      enabled: Env.NODE_ENV === 'production',
      window: 10,
      max: 100,
    },
    // Workspace tenancy (ADR-0028). The same plugin builder feeds the migration
    // generator, so the running schema and the committed migration agree
    // (ADR-0017 §3); `sendInvitationEmail` is behavioral (it changes no table), so
    // wiring it here keeps the generator and the running app in agreement. The
    // default-workspace-on-signup hook is Phase 1b.
    plugins: [
      buildOrganizationPlugin({
        // Fail-soft invitation email (ADR-0028, Phase 4): mirrors the reset/verify
        // hooks. Extracted to `createSendInvitationEmail` so its fail-soft +
        // log-discipline contract (the accept URL is logged only when email is
        // unconfigured) is unit-tested in isolation.
        sendInvitationEmail: createSendInvitationEmail({
          email,
          logger,
          frontendOrigin: Env.CORS_ORIGIN,
        }),
      }),
    ],
    ...(googleSocial !== undefined ? { socialProviders: googleSocial } : {}),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      // Better Auth invokes this when a sign-up request hits an already-
      // registered email. Because `requireEmailVerification` is true, the
      // response is a synthetic 200 (OWASP-aligned email enumeration
      // protection — no DB write happens). We surface the attempt as a
      // structured Pino warn so brute-force enumeration is visible in
      // logs/metrics without changing the protection itself. See
      // ADR-0011 "Email enumeration protection" and Phase 4.1 bug B7.
      onExistingUserSignUp: async ({ user }, request) => {
        const requestId = request?.headers.get('x-request-id') ?? undefined;
        logger.warn(
          { event: 'auth.signup.existing_email', email: user.email, requestId },
          'auth: sign-up attempt for already-registered email',
        );
      },
      sendResetPassword: async ({ user, token }, request) => {
        try {
          const locale = negotiateLocale(request?.headers.get('accept-language') ?? null, {
            override: request?.headers.get('x-toopo-locale') ?? null,
          });
          const frontendUrl = buildResetPasswordUrl({
            token,
            locale,
            frontendOrigin: Env.CORS_ORIGIN,
          });
          await email.sendResetPasswordEmail({
            to: user.email,
            name: user.name,
            url: frontendUrl,
            locale,
          });
        } catch (error) {
          logger.error({ err: error, to: user.email }, 'auth: reset-password send failed');
        }
      },
    },
    // Verification emails: Better Auth automatically invokes
    // `sendVerificationEmail` on successful sign-up when
    // `emailAndPassword.requireEmailVerification: true` (verified live in
    // Phase 4.1 — real Resend messageId observed on the signup probe).
    // No explicit `sendOnSignUp` flag is required. `sendOnSignIn: true`
    // re-triggers the same email when an unverified user attempts to
    // sign in, so they always have a fresh link to click.
    emailVerification: {
      sendOnSignIn: true,
      sendVerificationEmail: async ({ user, token }, request) => {
        try {
          const locale = negotiateLocale(request?.headers.get('accept-language') ?? null, {
            override: request?.headers.get('x-toopo-locale') ?? null,
          });
          const frontendUrl = buildVerifyEmailUrl({
            token,
            locale,
            frontendOrigin: Env.CORS_ORIGIN,
          });
          await email.sendVerificationEmail({
            to: user.email,
            name: user.name,
            url: frontendUrl,
            locale,
          });
        } catch (error) {
          logger.error({ err: error, to: user.email }, 'auth: verification send failed');
        }
      },
    },
    // Block session creation for soft-deleted users (RGPD Article 17).
    // See `auth.soft-delete-guard.ts` for the rationale and ADR-0011
    // §Soft-delete authentication boundary. SessionGuard provides a
    // defense-in-depth check at the request layer.
    databaseHooks: {
      session: {
        create: {
          // Soft-delete guard first (it throws to block a banned user), then
          // ensure the session has an active workspace. Provisioning is fail-
          // soft — it returns null instead of throwing — so it can never block a
          // legitimate sign-in (ADR-0028, Phase 1b). Spreading `session`
          // preserves every field Better Auth set; we only add the active id.
          before: async (session) => {
            await sessionCreateBefore(session);
            const activeOrganizationId = await ensureActiveWorkspace(session.userId);
            return activeOrganizationId === null
              ? undefined
              : { data: { ...session, activeOrganizationId } };
          },
        },
      },
    },
  });

  return auth;
}
