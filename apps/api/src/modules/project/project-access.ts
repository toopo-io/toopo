/**
 * The graph access-control predicate (ADR-0022 §2), isolated in one place so the
 * OSS line and the future cloud line never tangle.
 *
 * OSS self-host is INSTANCE-TENANT: the instance is one tenant, so any
 * authenticated user of the instance may access any project on it. The session
 * is already proven by the SessionGuard before this runs, so the predicate is
 * trivially `true` here. `owner_user_id` is still recorded on the project for
 * provenance and for the cloud rule.
 *
 * The hosted/cloud per-user/org isolation is a LATER decision (a future hosted
 * ADR): it would replace this predicate's body with a membership check
 * (`project.ownerUserId === session.user.id`, or org membership) — a one-line,
 * one-place change. Billing and hosted-only logic never live in this repo.
 */
import type { ProjectRecord } from '@toopo/db';
import type { CurrentSessionData } from '../user/session.guard';

export function canAccessProject(_session: CurrentSessionData, _project: ProjectRecord): boolean {
  return true;
}
