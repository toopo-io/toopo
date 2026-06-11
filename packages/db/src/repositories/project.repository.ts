/**
 * The project-persistence abstraction (ADR-0017 §1 repository pattern, ADR-0022),
 * mirroring {@link UserRepository} and {@link GraphRepository}. Callers depend on
 * this interface, never on Kysely, so the storage engine stays swappable behind
 * it. Projects are the tenancy scope of the code graph: every graph read/write is
 * keyed by a project id resolved through this repository.
 */
import type { Page, PageOptions } from './graph-page.js';
import type { ProjectRecord } from './project-records.js';

/** The fields required to connect a repo as a project (ADR-0022 §1). */
export interface CreateProjectInput {
  /** The connecting user (recorded for provenance + future cloud isolation). */
  readonly ownerUserId: string;
  /**
   * The Workspace the project belongs to (ADR-0028): the owner's resolved
   * workspace at connect time. Graph access is authorized through membership of
   * this workspace (Phase 3). A logical reference (no SQL FK; ADR-0017 §7).
   */
  readonly workspaceId: string;
  /** The repo host (e.g. `github`). */
  readonly repoHost: string;
  /** The owner/org on the host. */
  readonly repoOwner: string;
  /** The repo name on the host. */
  readonly repoName: string;
  /** Optional host installation id (e.g. a GitHub App install). */
  readonly installationId?: string | null | undefined;
}

export interface ProjectRepository {
  /**
   * Create a project for a connected repo, returning the stored record. The
   * `(repoHost, repoOwner, repoName)` triple is unique per instance, so creating
   * a second project for the same repo rejects at the unique index — callers that
   * want idempotent connect resolve via {@link findProjectByRepo} first.
   */
  createProject(input: CreateProjectInput): Promise<ProjectRecord>;

  /** The project for an id, or `null` when absent. */
  findProjectById(id: string): Promise<ProjectRecord | null>;

  /**
   * The project for a repo triple, or `null`. Returns archived projects too, so a
   * re-connect resolves and {@link reviveProject}s the existing row rather than
   * colliding on the unique repo index (ADR-0026 §3, §7).
   */
  findProjectByRepo(
    repoHost: string,
    repoOwner: string,
    repoName: string,
  ): Promise<ProjectRecord | null>;

  /**
   * Every project linked to a GitHub-App installation (ADR-0026 §7). The bridge
   * from an anonymous `installation.deleted` webhook to the rows to archive; the
   * set is bounded by what the installation grants.
   */
  findProjectsByInstallationId(installationId: string): Promise<readonly ProjectRecord[]>;

  /**
   * Soft-archive a project (ADR-0026 §7): set `archived_at` so the picker hides it
   * while the graph is preserved. Idempotent — archiving an archived project is a
   * no-op overwrite of the timestamp.
   */
  archiveProject(id: string, archivedAt: Date): Promise<void>;

  /**
   * Re-activate a project on re-connect (ADR-0026 §7): clear `archived_at` and
   * refresh the installation id (a re-install may carry a new one). The inverse of
   * {@link archiveProject}, used when {@link findProjectByRepo} resolves an
   * existing (possibly archived) row instead of creating a duplicate.
   */
  reviveProject(id: string, installationId: string | null): Promise<void>;

  /**
   * The caller's ACTIVE projects, keyset-paged by id (ADR-0020 §4 — always
   * bounded): the active projects whose `workspace_id` is one of `workspaceIds`,
   * the caller's workspaces (ADR-0028, Phase 3). Archived projects (ADR-0026 §7)
   * are excluded. An empty `workspaceIds` yields an empty page — a user in no
   * workspace sees nothing. This supersedes the former instance-wide listing
   * (ADR-0022 §2 → membership-scoped); an instance-admin all-projects view is a
   * deliberately-deferred additive seam, not built.
   */
  listProjectsInWorkspaces(
    workspaceIds: readonly string[],
    options?: PageOptions,
  ): Promise<Page<ProjectRecord>>;
}
