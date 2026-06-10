/**
 * Lazy personal-workspace provisioning for the session-create hook (ADR-0028,
 * Phase 1b). On session creation Toopo ensures the user owns a workspace and
 * returns its id so the hook can mark it active.
 *
 * Two invariants the design guarantees:
 *
 *  - ABSOLUTELY fail-soft. Any failure here logs and returns `null` so the
 *    session still proceeds — provisioning must NEVER block authentication. The
 *    next session simply retries. It composes AFTER the soft-delete guard, which
 *    is the only legitimate reason to block a session.
 *
 *  - Race-safe. Concurrent first sessions can both observe "no workspace" and
 *    both attempt creation; the personal workspace's deterministic unique slug
 *    (`user-${id}`) makes the loser's insert fail. We swallow that, re-read, and
 *    return the winner's workspace — so exactly one ever exists.
 *
 * Dependencies are injected (no Better Auth, no DB import) so the policy is unit
 * tested in isolation, mirroring `createSessionCreateBeforeHook`.
 */
export interface WorkspaceProvisioningDeps {
  /** The user's earliest workspace id, or `null` when they have none. */
  readonly findFirstWorkspaceId: (userId: string) => Promise<string | null>;
  /**
   * Create the user's personal workspace and return its id. Expected to throw
   * on the unique-slug race (a concurrent creator won) — the caller recovers by
   * re-reading. May return `null` if creation yields no workspace.
   */
  readonly createPersonalWorkspace: (userId: string) => Promise<string | null>;
  readonly logger: { error: (obj: Record<string, unknown>, msg: string) => void };
}

/**
 * Builds the `ensureActiveWorkspace(userId)` policy: return the user's existing
 * workspace, else create the personal one, recovering from the creation race
 * and never throwing.
 */
export function createEnsureActiveWorkspace(
  deps: WorkspaceProvisioningDeps,
): (userId: string) => Promise<string | null> {
  const { findFirstWorkspaceId, createPersonalWorkspace, logger } = deps;

  return async function ensureActiveWorkspace(userId: string): Promise<string | null> {
    try {
      const existing = await findFirstWorkspaceId(userId);
      if (existing !== null) {
        return existing;
      }
      return await createPersonalWorkspace(userId);
    } catch (error) {
      // A concurrent first session may have created the workspace between our
      // read and our write (unique-slug collision). Re-read before giving up.
      const raced = await findFirstWorkspaceId(userId).catch(() => null);
      if (raced !== null) {
        return raced;
      }
      logger.error(
        { err: error, event: 'auth.workspace.provision_failed', userId },
        'auth: failed to ensure a personal workspace (fail-soft; session proceeds)',
      );
      return null;
    }
  };
}
