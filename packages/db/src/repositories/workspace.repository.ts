/**
 * Read-only existence check over the organization-plugin `organization` table
 * (ADR-0028) — the Workspace in Toopo's product vocabulary (F4). Better Auth owns
 * every workspace WRITE through its server API; Toopo only ever READS. This seam
 * exists for the worker populate path: the worker has no session, so it attributes
 * a CLI-populated project to a workspace it is GIVEN (`--workspace-id`). It must
 * confirm that workspace is real before creating the project — otherwise it would
 * silently produce a project no one can reach under membership-scoped access
 * (Phase 3). The worker cannot create the workspace itself (Better Auth owns that
 * write), so a missing one is a loud failure, never a fabricated row.
 */
export interface WorkspaceRepository {
  /** Whether a workspace (organization) with this id exists. */
  exists(workspaceId: string): Promise<boolean>;
}
