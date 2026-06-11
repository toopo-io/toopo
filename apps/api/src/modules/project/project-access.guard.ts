/**
 * Resolves and authorizes the `:projectId` path parameter (ADR-0022 §5), the API
 * half of the Fork-5 closure (the data half is the composite-key scoping in
 * @toopo/db). It runs AFTER the SessionGuard (which proves a session), then:
 *   1. resolves `:projectId` to a project row (404 if unknown),
 *   2. authorizes by workspace membership (403 if denied),
 *   3. attaches the resolved project to the request for `@CurrentProject`.
 *
 * A request thus reaches a graph handler only with a session AND a real,
 * authorized project — the handler then scopes every read by `project.id`.
 *
 * Authorization is MEMBERSHIP-SCOPED (ADR-0028, Phase 3): a user reaches a project
 * iff they are a member of the project's workspace. This SUPERSEDES only the
 * instance-tenant authorization of ADR-0022 §2 (where any authenticated user of
 * the instance could reach any project); the composite primary key and the
 * mandatory GraphScope stand. `owner_user_id` remains on the project for
 * provenance; authorization runs through membership. The workspace is read from
 * the PERSISTED project (`project.workspace_id`), never the request, so a caller
 * can never spoof the workspace they are checked against. A deliberately-deferred
 * instance-admin escape hatch would extend the single membership check here
 * (`member || session.isInstanceAdmin`) — noted, NOT built (ADR-0028).
 */
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { MembershipRepository, ProjectRecord, ProjectRepository } from '@toopo/db';
import { MEMBERSHIP_REPOSITORY, PROJECT_REPOSITORY } from '../database/database.module';
import type { RequestWithSession } from '../user/session.guard';

export interface RequestWithProject extends RequestWithSession {
  toopoProject?: ProjectRecord;
}

@Injectable()
export class ProjectAccessGuard implements CanActivate {
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(MEMBERSHIP_REPOSITORY) private readonly memberships: MembershipRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithProject>();

    const session = req.betterAuthSession;
    if (session === undefined) {
      // Defensive: this guard must be registered after the SessionGuard. The
      // failure shape matches the SessionGuard's so it never leaks ordering.
      throw new UnauthorizedException('Session required');
    }

    const projectId = (req.params as { projectId?: string }).projectId;
    if (projectId === undefined || projectId.length === 0) {
      throw new NotFoundException('Project not found');
    }

    const project = await this.projects.findProjectById(projectId);
    if (project === null) {
      throw new NotFoundException('Project not found');
    }

    // Membership-scoped access (ADR-0028, Phase 3): the workspace is read from the
    // PERSISTED project, never the request, so a caller cannot spoof it.
    const member = await this.memberships.isMember(session.user.id, project.workspaceId);
    if (!member) {
      throw new ForbiddenException('Forbidden');
    }

    req.toopoProject = project;
    return true;
  }
}
