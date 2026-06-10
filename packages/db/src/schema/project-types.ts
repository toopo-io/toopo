/**
 * Kysely table type for the project schema module (ADR-0022), matching the
 * committed `0004_project.sql` on both backends. The project is the tenancy
 * scope every code graph is partitioned by — an administrative "connected repo"
 * entity, distinct from the graph `repo` node (ADR-0015 §2).
 *
 * Cross-backend read reality, normalized at the repository boundary (ADR-0006,
 * ADR-0017 §10): timestamps come back as a `Date` from Postgres and an ISO
 * `string` from libSQL, and are written as ISO strings (both backends accept).
 */

/** A timestamp column: `Date` from Postgres, ISO `string` from libSQL. */
type DbTimestamp = Date | string;

export interface ProjectTable {
  id: string;
  owner_user_id: string;
  repo_host: string;
  repo_owner: string;
  repo_name: string;
  installation_id: string | null;
  created_at: DbTimestamp;
  updated_at: DbTimestamp;
}

/** The Kysely database schema for the project module. */
export interface ProjectDatabase {
  project: ProjectTable;
}
