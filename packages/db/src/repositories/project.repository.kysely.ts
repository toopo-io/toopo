/**
 * Kysely implementation of {@link ProjectRepository}. Portable across both
 * backends (ADR-0017 §6): no dialect-specific SQL, parameterized everywhere,
 * keyset-paged listing, and every row normalized through the Zod boundary
 * (ADR-0006) before it leaves the repository. Timestamps are written as ISO
 * strings, which Postgres and libSQL both accept; ids are generated with Node's
 * built-in `crypto.randomUUID` (zero dependencies, ADR-0015's no-native-build
 * spirit).
 */
import { randomUUID } from 'node:crypto';
import type { Insertable, Kysely } from 'kysely';
import type { ProjectDatabase, ProjectTable } from '../schema/project-types.js';
import {
  buildPage,
  clampLimit,
  decodeCursorTuple,
  encodeCursor,
  type Page,
  type PageOptions,
} from './graph-page.js';
import type { CreateProjectInput, ProjectRepository } from './project.repository.js';
import { type ProjectRecord, rowToProject } from './project-records.js';

export class KyselyProjectRepository implements ProjectRepository {
  constructor(private readonly db: Kysely<ProjectDatabase>) {}

  async createProject(input: CreateProjectInput): Promise<ProjectRecord> {
    const now = new Date().toISOString();
    const row: Insertable<ProjectTable> = {
      id: randomUUID(),
      owner_user_id: input.ownerUserId,
      workspace_id: input.workspaceId,
      repo_host: input.repoHost,
      repo_owner: input.repoOwner,
      repo_name: input.repoName,
      installation_id: input.installationId ?? null,
      archived_at: null,
      created_at: now,
      updated_at: now,
    };
    await this.db.insertInto('project').values(row).execute();
    return rowToProject({
      ...row,
      installation_id: row.installation_id ?? null,
      archived_at: null,
    });
  }

  async findProjectById(id: string): Promise<ProjectRecord | null> {
    const row = await this.db
      .selectFrom('project')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row === undefined ? null : rowToProject(row);
  }

  async findProjectByRepo(
    repoHost: string,
    repoOwner: string,
    repoName: string,
  ): Promise<ProjectRecord | null> {
    const row = await this.db
      .selectFrom('project')
      .selectAll()
      .where('repo_host', '=', repoHost)
      .where('repo_owner', '=', repoOwner)
      .where('repo_name', '=', repoName)
      .executeTakeFirst();
    return row === undefined ? null : rowToProject(row);
  }

  async findProjectsByInstallationId(installationId: string): Promise<readonly ProjectRecord[]> {
    const rows = await this.db
      .selectFrom('project')
      .selectAll()
      .where('installation_id', '=', installationId)
      .orderBy('id')
      .execute();
    return rows.map(rowToProject);
  }

  async archiveProject(id: string, archivedAt: Date): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .updateTable('project')
      .set({ archived_at: archivedAt.toISOString(), updated_at: now })
      .where('id', '=', id)
      .execute();
  }

  async reviveProject(
    id: string,
    installationId: string | null,
    workspaceId?: string,
  ): Promise<void> {
    const now = new Date().toISOString();
    const changes = { archived_at: null, installation_id: installationId, updated_at: now };
    await this.db
      .updateTable('project')
      .set(workspaceId === undefined ? changes : { ...changes, workspace_id: workspaceId })
      .where('id', '=', id)
      .execute();
  }

  async listProjectsInWorkspaces(
    workspaceIds: readonly string[],
    options?: PageOptions,
  ): Promise<Page<ProjectRecord>> {
    const limit = clampLimit(options?.limit);
    // A user in no workspace sees nothing — return early rather than emit an
    // empty `in ()` predicate (which dialects handle inconsistently).
    if (workspaceIds.length === 0) {
      return buildPage<ProjectRecord>([], limit, (project) => encodeCursor([project.id]));
    }
    let query = this.db
      .selectFrom('project')
      .selectAll()
      .where('archived_at', 'is', null)
      .where('workspace_id', 'in', [...workspaceIds]);
    if (options?.cursor !== undefined) {
      query = query.where('id', '>', String(decodeCursorTuple(options.cursor, 1)[0]));
    }
    const rows = await query
      .orderBy('id')
      .limit(limit + 1)
      .execute();
    return buildPage(rows.map(rowToProject), limit, (project) => encodeCursor([project.id]));
  }
}
