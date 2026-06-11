/**
 * The project read API (ADR-0022 §5, membership-scoped per ADR-0028 §Phase 3):
 * list the caller's-workspace connected repos and fetch one by id. Read-only —
 * project creation is the install flow's job; public connect is the GitHub-App
 * phase. Access is workspace membership (superseding ADR-0022 §2's instance-tenant
 * line): `list` returns only projects in workspaces the caller belongs to, and
 * `get` runs through the ProjectAccessGuard (member → 200, non-member → 403,
 * unknown → 404) — sealing the same cross-workspace leak the graph routes close.
 */
import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  GRAPH_PROJECT_ID_PARAM,
  PROJECTS_CONTROLLER_PATH,
  type ProjectPage,
  type ProjectResponse,
} from '@toopo/api-contracts';
import type { MembershipRepository, ProjectRecord, ProjectRepository } from '@toopo/db';
import { ZodSerializerDto } from 'nestjs-zod';
import { MEMBERSHIP_REPOSITORY, PROJECT_REPOSITORY } from '../database/database.module';
import { CurrentSession } from '../user/current-session.decorator';
import { type CurrentSessionData, SessionGuard } from '../user/session.guard';
import { CurrentProject } from './current-project.decorator';
import { ProjectListQueryDto, ProjectPageDto, ProjectResponseDto } from './project.dto';
import { ProjectAccessGuard } from './project-access.guard';
import { toProjectResponse } from './project-response';

@ApiTags('projects')
@Controller({ path: PROJECTS_CONTROLLER_PATH, version: '1' })
@UseGuards(SessionGuard)
export class ProjectController {
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(MEMBERSHIP_REPOSITORY) private readonly memberships: MembershipRepository,
  ) {}

  @Get()
  @ApiOperation({ summary: "List the caller's connected projects (keyset-paged)" })
  @ZodSerializerDto(ProjectPageDto)
  async list(
    @CurrentSession() session: CurrentSessionData,
    @Query() query: ProjectListQueryDto,
  ): Promise<ProjectPage> {
    const workspaceIds = await this.memberships.listWorkspaceIds(session.user.id);
    const page = await this.projects.listProjectsInWorkspaces(workspaceIds, {
      limit: query.limit,
      cursor: query.cursor,
    });
    return { items: page.items.map(toProjectResponse), nextCursor: page.nextCursor };
  }

  @Get(`:${GRAPH_PROJECT_ID_PARAM}`)
  @ApiOperation({ summary: 'Fetch one connected project by id' })
  @UseGuards(ProjectAccessGuard)
  @ZodSerializerDto(ProjectResponseDto)
  get(@CurrentProject() project: ProjectRecord): ProjectResponse {
    // The ProjectAccessGuard already resolved + membership-authorized the project
    // (404 unknown, 403 non-member); we only serialize it.
    return toProjectResponse(project);
  }
}
