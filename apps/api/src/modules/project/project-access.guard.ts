/**
 * Resolves and authorizes the `:projectId` path parameter (ADR-0022 §5), the API
 * half of the Fork-5 closure (the data half is the composite-key scoping in
 * @toopo/db). It runs AFTER the SessionGuard (which proves a session), then:
 *   1. resolves `:projectId` to a project row (404 if unknown),
 *   2. runs the isolated {@link canAccessProject} predicate (403 if denied),
 *   3. attaches the resolved project to the request for `@CurrentProject`.
 *
 * A request thus reaches a graph handler only with a session AND a real,
 * authorized project — the handler then scopes every read by `project.id`.
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
import type { ProjectRecord, ProjectRepository } from '@toopo/db';
import { PROJECT_REPOSITORY } from '../database/database.module';
import type { RequestWithSession } from '../user/session.guard';
import { canAccessProject } from './project-access';

export interface RequestWithProject extends RequestWithSession {
  toopoProject?: ProjectRecord;
}

@Injectable()
export class ProjectAccessGuard implements CanActivate {
  constructor(@Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository) {}

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

    if (!canAccessProject(session, project)) {
      throw new ForbiddenException('Forbidden');
    }

    req.toopoProject = project;
    return true;
  }
}
