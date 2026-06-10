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

  /** The project for a repo triple (the worker's populate target), or `null`. */
  findProjectByRepo(
    repoHost: string,
    repoOwner: string,
    repoName: string,
  ): Promise<ProjectRecord | null>;

  /**
   * The instance's projects, keyset-paged by id (ADR-0020 §4 — always bounded).
   * The OSS authorization line (ADR-0022 §2) is instance-tenant, so this lists
   * every project on the instance; per-user/org filtering is a future hosted
   * concern, applied above this layer.
   */
  listProjects(options?: PageOptions): Promise<Page<ProjectRecord>>;
}
