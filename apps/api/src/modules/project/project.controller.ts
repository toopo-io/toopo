/**
 * The project read API (ADR-0022 §5): list the instance's connected repos and
 * fetch one by id. Read-only — project creation is the worker's job for now
 * (resolve-or-create from repo coordinates); public connect is deferred to the
 * GitHub-App phase. Guarded by the SessionGuard: the OSS line is instance-tenant
 * (any authenticated user sees the instance's projects, ADR-0022 §2).
 */
import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  GRAPH_PROJECT_ID_PARAM,
  PROJECTS_CONTROLLER_PATH,
  type ProjectPage,
  type ProjectResponse,
} from '@toopo/api-contracts';
import type { ProjectRepository } from '@toopo/db';
import { ZodSerializerDto } from 'nestjs-zod';
import { PROJECT_REPOSITORY } from '../database/database.module';
import { SessionGuard } from '../user/session.guard';
import { ProjectListQueryDto, ProjectPageDto, ProjectResponseDto } from './project.dto';
import { toProjectResponse } from './project-response';

@ApiTags('projects')
@Controller({ path: PROJECTS_CONTROLLER_PATH, version: '1' })
@UseGuards(SessionGuard)
export class ProjectController {
  constructor(@Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository) {}

  @Get()
  @ApiOperation({ summary: "List the instance's connected projects (keyset-paged)" })
  @ZodSerializerDto(ProjectPageDto)
  async list(@Query() query: ProjectListQueryDto): Promise<ProjectPage> {
    const page = await this.projects.listProjects({ limit: query.limit, cursor: query.cursor });
    return { items: page.items.map(toProjectResponse), nextCursor: page.nextCursor };
  }

  @Get(`:${GRAPH_PROJECT_ID_PARAM}`)
  @ApiOperation({ summary: 'Fetch one connected project by id' })
  @ZodSerializerDto(ProjectResponseDto)
  async get(@Param(GRAPH_PROJECT_ID_PARAM) projectId: string): Promise<ProjectResponse> {
    const project = await this.projects.findProjectById(projectId);
    if (project === null) {
      throw new NotFoundException('Project not found');
    }
    return toProjectResponse(project);
  }
}
