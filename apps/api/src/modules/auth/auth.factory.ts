import { authSchemaOptions, type UserRepository } from '@toopo/db';
import { negotiateLocale } from '@toopo/i18n';
import { betterAuth } from 'better-auth';
import type { Logger } from 'nestjs-pino';
import { Env } from '../../env';
import type { DatabaseService } from '../database/database.module';
import { createSessionCreateBeforeHook } from './auth.soft-delete-guard';
import type { AuthEmailService } from './email/email.service';
import { buildResetPasswordUrl, buildVerifyEmailUrl } from './email/url-builders';

export type Auth = ReturnType<typeof createAuth>;

export function createAuth(
  logger: Logger,
  email: AuthEmailService,
  database: DatabaseService,
  userRepository: UserRepository,
) {
  const sessionCreateBefore = createSessionCreateBeforeHook({
    logger,
    getUserDeletedAt: (userId) => userRepository.findDeletedAt(userId),
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
  return betterAuth({
    ...authSchemaOptions,
    database: { db: database.db, type: database.type },
    secret: Env.BETTER_AUTH_SECRET,
    baseURL: Env.BETTER_AUTH_URL,
    basePath: '/v1/auth',
    trustedOrigins: [Env.CORS_ORIGIN],
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
          before: sessionCreateBefore,
        },
      },
    },
  });
}
