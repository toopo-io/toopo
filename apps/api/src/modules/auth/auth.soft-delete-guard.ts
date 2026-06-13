/**
 * Soft-delete authentication boundary (B10 — Phase 4.1.6 finding).
 *
 * Better Auth has no awareness of our `user.deleted_at` column (a custom
 * extension beyond the canonical schema). Without this hook, a user who
 * exercised RGPD Article 17 (right to erasure) could re-authenticate
 * indefinitely: `softDeleteUser` flips `deleted_at` and revokes existing
 * sessions, but the next `sign-in/email` would happily re-create one.
 *
 * The hook factory returned here is registered via
 * `betterAuth({ databaseHooks: { session: { create: { before: ... } } } })`
 * in `auth.factory.ts`. It rejects session creation for soft-deleted users
 * by throwing the SAME APIError shape Better Auth itself emits for a
 * wrong-password attempt (`UNAUTHORIZED` / `INVALID_EMAIL_OR_PASSWORD`).
 * Consistent failure modes prevent leaking the existence of a deleted
 * account through a distinguishable error surface.
 *
 * The repository lookup is injected as a `getUserDeletedAt` callback so this
 * module has no DB dependency — unit tests pass a synchronous fake.
 *
 * `SessionGuard` provides defense-in-depth at the request layer in case
 * this hook is ever bypassed (Better Auth upgrade, bug, direct adapter
 * use).
 *
 * See ADR-0011 §Soft-delete authentication boundary and ADR-0013.
 */
import { APIError } from 'better-auth';

export interface SessionCreatePayload {
  readonly userId: string;
}

type GetUserDeletedAt = (userId: string) => Promise<Date | null | undefined>;

export interface SoftDeleteHookDeps {
  readonly getUserDeletedAt: GetUserDeletedAt;
  readonly logger: { warn: (obj: Record<string, unknown>, msg: string) => void };
}

export function createSessionCreateBeforeHook(
  deps: SoftDeleteHookDeps,
): (session: SessionCreatePayload) => Promise<void> {
  const { getUserDeletedAt, logger } = deps;

  return async function sessionCreateBefore(session: SessionCreatePayload): Promise<void> {
    const deletedAt = await getUserDeletedAt(session.userId);
    if (deletedAt === null || deletedAt === undefined) {
      return;
    }

    logger.warn(
      { event: 'auth.signin.soft_deleted_blocked', userId: session.userId },
      'auth: blocked session create for soft-deleted user',
    );
    throw APIError.from('UNAUTHORIZED', {
      code: 'INVALID_EMAIL_OR_PASSWORD',
      message: 'Invalid email or password',
    });
  };
}
