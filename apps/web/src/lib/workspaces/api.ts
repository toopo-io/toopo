/**
 * The typed client for the caller's workspaces (ADR-0028: Workspace = Better Auth
 * organization). Reads the organization plugin's list endpoint, which returns the
 * orgs the session user is a member of — the membership read seam, the same
 * predicate that scopes project access. Validated at the boundary (ADR-0006).
 *
 * Used by the shell (a gated server component) to populate the workspace picker;
 * it forwards the session cookie via `init`. The workspace list is display chrome,
 * not an access gate, so a failed read degrades to an empty list (the shell still
 * renders) rather than blocking the page.
 */
import { Env } from '../../../env';
import { WorkspaceListSchema, type WorkspaceSummary } from './workspace';

export async function listMyWorkspaces(init?: RequestInit): Promise<readonly WorkspaceSummary[]> {
  try {
    const response = await fetch(`${Env.NEXT_PUBLIC_AUTH_URL}/v1/auth/organization/list`, {
      ...init,
      headers: { Accept: 'application/json', ...(init?.headers ?? {}) },
      cache: 'no-store',
    });
    if (!response.ok) {
      return [];
    }
    const parsed = WorkspaceListSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}
