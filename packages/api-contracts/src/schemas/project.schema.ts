/**
 * The project read-API contract (ADR-0022 §1, §5): the wire shape of a connected
 * repo and the list query, shared FE/BE as one source of truth (ADR-0006).
 * Timestamps are ISO strings on the wire (the repository returns `Date`; the
 * controller serializes). The project is an administrative entity, distinct from
 * the graph `repo` node — it is not part of the `@toopo/core` graph model.
 */
import { z } from 'zod';
import { paginated } from './graph.schema.js';

/** A connected repo on the wire (ADR-0022 §1). */
export const ProjectResponseSchema = z
  .object({
    id: z.string(),
    /** The connecting user (provenance + future cloud isolation, ADR-0022 §2). */
    ownerUserId: z.string(),
    repoHost: z.string(),
    repoOwner: z.string(),
    repoName: z.string(),
    installationId: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();
export type ProjectResponse = z.infer<typeof ProjectResponseSchema>;

/** A keyset-paginated page of projects (ADR-0020 Fork 4). */
export const ProjectPageSchema = paginated(ProjectResponseSchema);
export type ProjectPage = z.infer<typeof ProjectPageSchema>;

/** Query for `GET /v1/projects`: keyset pagination only (instance-tenant list). */
export const ProjectListQuerySchema = z
  .object({
    limit: z.coerce.number().int().positive().optional(),
    cursor: z.string().min(1).optional(),
  })
  .strict();
export type ProjectListQuery = z.infer<typeof ProjectListQuerySchema>;

/**
 * Body for `PATCH /v1/projects/:projectId/workspace` (ADR-0028, Phase 5): the
 * target workspace to re-home the project into. The server authorizes the move
 * (caller owns the source workspace AND is a member of the target); a non-member
 * or non-existent target is denied, so the body carries only the destination id.
 */
export const AssignProjectWorkspaceRequestSchema = z
  .object({
    workspaceId: z.string().min(1),
  })
  .strict();
export type AssignProjectWorkspaceRequest = z.infer<typeof AssignProjectWorkspaceRequestSchema>;
