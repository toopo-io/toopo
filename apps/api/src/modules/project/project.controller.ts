/**
 * The project read API (ADR-0022 §5, membership-scoped per ADR-0028 §Phase 3 + §4):
 * list the active workspace's connected repos and fetch one by id. Read-only —
 * project creation is the install flow's job; public connect is the GitHub-App
 * phase. Access is workspace membership (superseding ADR-0022 §2's instance-tenant
 * line): `list` returns the projects in the caller's ACTIVE workspace (ADR-0028 §4),
 * and `get` runs through the ProjectAccessGuard (member → 200, non-member → 403,
 * unknown → 404) — sealing the same cross-workspace leak the graph routes close.
 */
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  GRAPH_PROJECT_ID_PARAM,
  PROJECT_WORKSPACE_SEGMENT,
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
import {
  AssignProjectWorkspaceDto,
  ProjectListQueryDto,
  ProjectPageDto,
  ProjectResponseDto,
} from './project.dto';
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
  @ApiOperation({ summary: "List the active workspace's connected projects (keyset-paged)" })
  @ZodSerializerDto(ProjectPageDto)
  async list(
    @CurrentSession() session: CurrentSessionData,
    @Query() query: ProjectListQueryDto,
  ): Promise<ProjectPage> {
    const workspaceId = await this.resolveActiveWorkspaceId(session);
    const page = await this.projects.listProjectsInWorkspaces(
      workspaceId === null ? [] : [workspaceId],
      { limit: query.limit, cursor: query.cursor },
    );
    return { items: page.items.map(toProjectResponse), nextCursor: page.nextCursor };
  }

  /**
   * The workspace the listing is scoped to (ADR-0028 §4): the session's active
   * workspace, set by Better Auth only to a workspace the caller is a member of —
   * so it is membership-safe and unspoofable (read from the session, never the
   * request). When the session carries no active workspace (one predating the
   * active-workspace hook, or a fail-soft provisioning miss), fall back to the
   * caller's earliest membership — the same resolver session creation uses — so a
   * valid user never sees a blank sidebar. Null only when the caller belongs to no
   * workspace, which lists nothing.
   */
  private async resolveActiveWorkspaceId(session: CurrentSessionData): Promise<string | null> {
    const active = session.session.activeOrganizationId;
    if (active !== null) {
      return active;
    }
    return this.memberships.findFirstWorkspaceId(session.user.id);
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

  @Patch(`:${GRAPH_PROJECT_ID_PARAM}/${PROJECT_WORKSPACE_SEGMENT}`)
  @ApiOperation({ summary: 'Move a project to another workspace (source-owner gated)' })
  @UseGuards(ProjectAccessGuard)
  @ZodSerializerDto(ProjectResponseDto)
  async assignWorkspace(
    @CurrentProject() project: ProjectRecord,
    @CurrentSession() session: CurrentSessionData,
    @Body() body: AssignProjectWorkspaceDto,
  ): Promise<ProjectResponse> {
    // Option B gate (ADR-0028, Phase 5). The ProjectAccessGuard has already proven
    // the caller is a MEMBER of the source workspace; moving the project — which
    // changes its access boundary — additionally requires that they OWN the source
    // and are a MEMBER of the target. The source-owner check is localized here (the
    // only place Toopo reads the role); the guard stays membership-based.
    const ownsSource = await this.memberships.isWorkspaceOwner(
      session.user.id,
      project.workspaceId,
    );
    if (!ownsSource) {
      throw new ForbiddenException('Forbidden');
    }
    // Idempotent no-op: re-homing to the current workspace changes nothing. Placed
    // after the ownership gate (Option A — a non-owner never reaches here, even for
    // a no-op, so triviality is no bypass) and before the target probe, so the
    // no-op costs no extra query (the owner is, by definition, a member of source).
    if (body.workspaceId === project.workspaceId) {
      return toProjectResponse(project);
    }
    // A non-member or non-existent target → isMember is false → denied. The target
    // is never trusted from the body beyond this membership proof, so no leak.
    const memberOfTarget = await this.memberships.isMember(session.user.id, body.workspaceId);
    if (!memberOfTarget) {
      throw new ForbiddenException('Forbidden');
    }
    const moved = await this.projects.assignProjectToWorkspace(project.id, body.workspaceId);
    return toProjectResponse(moved);
  }
}
