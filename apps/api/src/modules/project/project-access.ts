/**
 * The graph access-control predicate (ADR-0022 §2, superseded in part by
 * ADR-0028 §Phase 3), isolated in one place so the OSS line and the future cloud
 * line never tangle.
 *
 * Workspace tenancy (ADR-0028) makes access MEMBERSHIP-SCOPED: a user reaches a
 * project iff they are a member of the project's workspace. This SUPERSEDES only
 * the instance-tenant authorization of ADR-0022 §2 (where any authenticated user
 * of the instance could reach any project); the rest of ADR-0022 — the composite
 * primary key and the mandatory GraphScope — stands. `owner_user_id` remains on
 * the project for provenance; authorization runs through workspace membership.
 *
 * `isMember` is resolved by the caller (the ProjectAccessGuard) against the
 * persisted project's `workspace_id` — always read server-side, never from the
 * request — so this predicate stays pure and trivially testable. It is also the
 * single seam a future, deliberately-deferred instance-admin escape hatch would
 * extend (`isMember || session.isInstanceAdmin`) — noted here, NOT built.
 */
import type { ProjectRecord } from '@toopo/db';
import type { CurrentSessionData } from '../user/session.guard';

export function canAccessProject(
  _session: CurrentSessionData,
  _project: ProjectRecord,
  isMember: boolean,
): boolean {
  return isMember;
}
