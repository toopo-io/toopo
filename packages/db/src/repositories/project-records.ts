/**
 * The domain record returned by the {@link ProjectRepository}, plus the Zod
 * schema that normalizes a raw row at the storage boundary (ADR-0006, ADR-0017
 * §10). Reads cross two backends with different runtime types for timestamps
 * (`Date` vs ISO string), coerced here so callers see one clean camelCase shape
 * regardless of backend. The snake_case→camelCase mapping is explicit in
 * {@link rowToProject}, mirroring the graph record mappers.
 */
import { z } from 'zod';
import type { ProjectTable } from '../schema/project-types.js';

const dbDate = z.coerce.date();

/** A connected repo (ADR-0022): the tenancy scope of a code graph. */
export const ProjectRecordSchema = z.object({
  id: z.string(),
  /** Logical reference to the connecting `user` (no SQL FK; ADR-0017 §7). */
  ownerUserId: z.string(),
  repoHost: z.string(),
  repoOwner: z.string(),
  repoName: z.string(),
  /** Optional host installation id (a GitHub App install; ADR-0026 §3). */
  installationId: z.string().nullable(),
  /** Soft-archive timestamp (ADR-0026 §7): non-null once uninstalled/removed. */
  archivedAt: dbDate.nullable(),
  createdAt: dbDate,
  updatedAt: dbDate,
});
export type ProjectRecord = z.infer<typeof ProjectRecordSchema>;

type ProjectRowLike = {
  readonly id: string;
  readonly owner_user_id: string;
  readonly repo_host: string;
  readonly repo_owner: string;
  readonly repo_name: string;
  readonly installation_id: string | null;
  readonly archived_at: ProjectTable['archived_at'];
  readonly created_at: ProjectTable['created_at'];
  readonly updated_at: ProjectTable['updated_at'];
};

/** Map a snake_case project row to a validated camelCase record (boundary parse). */
export function rowToProject(row: ProjectRowLike): ProjectRecord {
  return ProjectRecordSchema.parse({
    id: row.id,
    ownerUserId: row.owner_user_id,
    repoHost: row.repo_host,
    repoOwner: row.repo_owner,
    repoName: row.repo_name,
    installationId: row.installation_id,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}
