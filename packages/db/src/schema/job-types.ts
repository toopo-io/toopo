/**
 * Kysely table type for the job-queue schema module (ADR-0023), matching the
 * committed `0006_job.sql` on both backends. The job is the durable unit behind
 * the DB-backed `Queue` impl; it stores a REFERENCE (project + repo coords +
 * commit sha), never code (security baseline).
 *
 * Cross-backend read reality, normalized at the repository boundary (ADR-0006,
 * ADR-0017 §10): timestamps come back as a `Date` from Postgres (`timestamptz`)
 * and an ISO `string` from libSQL (`text`), and are written as UTC ISO strings so
 * the claim predicate `available_at <= now` orders lexicographically ==
 * chronologically on both backends (ADR-0023 §5).
 */

/** A timestamp column: `Date` from Postgres, ISO `string` from libSQL. */
type DbTimestamp = Date | string;

export interface JobTable {
  id: string;
  dedupe_key: string | null;
  project_id: string;
  repo_host: string;
  repo_owner: string;
  repo_name: string;
  commit_sha: string;
  status: string;
  attempts: number;
  available_at: DbTimestamp;
  lease_until: DbTimestamp | null;
  last_error: string | null;
  created_at: DbTimestamp;
  updated_at: DbTimestamp;
}

/** The Kysely database schema for the job module. */
export interface JobDatabase {
  job: JobTable;
}
