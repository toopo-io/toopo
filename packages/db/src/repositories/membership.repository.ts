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

  /**
   * Whether the user is a member of the workspace — the graph access predicate
   * (ADR-0028, Phase 3): a user reaches a project iff they are a member of
   * `project.workspace_id`. The membership-scoped OSS authorization rule that
   * supersedes ADR-0022 §2's instance-tenant stance.
   */
  isMember(userId: string, workspaceId: string): Promise<boolean>;

  /**
   * Every workspace the user belongs to (deterministic order). Scopes the
   * project listing to the caller's workspaces (ADR-0028, Phase 3) — the user
   * lists only projects in a workspace they are a member of. Empty when the user
   * belongs to none.
   */
  listWorkspaceIds(userId: string): Promise<readonly string[]>;

  /**
   * Whether the user is an OWNER of the workspace — the source-owner half of the
   * Option B gate that authorizes moving a project between workspaces (ADR-0028,
   * Phase 5): a project may be re-homed only by an owner of its current workspace.
   * Reads Better Auth's native `member.role = 'owner'`; the only place Toopo reads
   * the role, kept localized to this one mutating decision (the membership-scoped
   * `isMember` predicate stays role-agnostic). `false` for a plain member, a
   * non-member, or an unknown user/workspace — never leaking which case it was.
   */
  isWorkspaceOwner(userId: string, workspaceId: string): Promise<boolean>;
}
