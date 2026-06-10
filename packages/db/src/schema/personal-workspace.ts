/**
 * THE canonical shape of a user's personal Workspace (ADR-0028). A personal
 * workspace is provisioned in TWO places that MUST agree, byte-for-byte:
 *
 *  - At RUNTIME, lazily, when a user's first session is created — Phase 1b's
 *    `createPersonalWorkspace` (apps/api `auth.factory`) calls Better Auth's
 *    `createOrganization` with this name and slug.
 *  - AT REST, by the Phase 2 backfill migration (`0010_project_workspace.sql`),
 *    which synthesizes the same organization + owner member directly in SQL for
 *    any pre-existing project whose owner has no membership yet.
 *
 * Convergence is the whole point: because both use the SAME deterministic slug
 * (`user-${id}`), a migration-synthesized workspace and a Phase-1b one are the
 * same row. When an owner whose workspace was synthesized at rest next signs in,
 * Phase 1b's slug-unique path finds it and is a clean no-op — never a duplicate.
 *
 * This module is that single source of truth. The migration is raw SQL and
 * cannot import these constants, so a parity test asserts the SQL output equals
 * the values here — drift between the two languages is caught, not hoped against.
 */

/** Display name of a freshly provisioned personal workspace; user-renameable. */
export const PERSONAL_WORKSPACE_NAME = 'Personal';

/**
 * The creator's role in their personal workspace. Better Auth's organization
 * plugin assigns `owner` to the creating user; the at-rest synthesis matches it.
 */
export const PERSONAL_WORKSPACE_OWNER_ROLE = 'owner';

/**
 * The deterministic, unique slug of a user's personal workspace. Unique per user
 * (the `organization.slug` unique index), which is exactly what makes a
 * concurrent or at-rest second creation collide instead of duplicating.
 */
export function personalWorkspaceSlug(userId: string): string {
  return `user-${userId}`;
}

/**
 * The shared sentinel workspace for projects whose `owner_user_id` resolves to no
 * user at backfill time (truly unattributable). It has NO members by design, so
 * those projects are inaccessible under membership-based access (Phase 3) until
 * an admin reassigns them — the correct posture, never a silent grant.
 */
export const ORPHANED_WORKSPACE_SLUG = 'orphaned-workspace';

/** Display name of the orphaned-projects sentinel workspace. */
export const ORPHANED_WORKSPACE_NAME = 'Orphaned projects';
