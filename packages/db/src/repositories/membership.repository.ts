/**
 * Read-only access to workspace membership — the Better Auth `member` table
 * (ADR-0028). Better Auth owns every membership WRITE through its organization
 * server API; Toopo only ever READS `member`, for two purposes: resolving a
 * session's active workspace (Phase 1b) and authorizing graph routes (Phase 3).
 * Kept a pure read seam behind this interface so the storage engine stays
 * swappable (ADR-0017 §1), exactly like {@link UserRepository}.
 *
 * "Workspace" is Toopo's product term for a Better Auth organization: the row
 * columns track Better Auth verbatim (`organizationId`), while the method names
 * speak the product vocabulary (ADR-0028, F4).
 */
export interface MembershipRepository {
  /**
   * The id of the user's earliest workspace — deterministic: oldest membership
   * first, ties broken by workspace id — or `null` when the user belongs to
   * none. Resolves the active workspace on session creation and lets the Phase 2
   * backfill reuse a user's existing default workspace instead of duplicating
   * the "ensure a default workspace" logic.
   */
  findFirstWorkspaceId(userId: string): Promise<string | null>;
}
