-- Job queue (ADR-0023): the Postgres mirror of the sqlite migration. Timestamps
-- are timestamptz (native chronological ordering); the UTC ISO-8601 strings the
-- impl sends cast cleanly on assignment and comparison. The claim uses
-- `FOR UPDATE SKIP LOCKED` (the single documented dialect seam, ADR-0023 section
-- 2) so concurrent cloud workers atomically grab DISTINCT rows.
--
-- No foreign key to `project`: project and queue are separate schema modules kept
-- physically separable (ADR-0017 section 7), the same no-FK stance the graph and
-- project modules take. Integrity is enforced at the application boundary.
create table "job" ("id" text not null primary key, "dedupe_key" text, "project_id" text not null, "repo_host" text not null, "repo_owner" text not null, "repo_name" text not null, "commit_sha" text not null, "status" text not null, "attempts" integer not null default 0, "available_at" timestamptz not null, "lease_until" timestamptz, "last_error" text, "created_at" timestamptz not null, "updated_at" timestamptz not null);

-- The claim scan: the oldest claimable job by (status, available_at).
create index "job_claim_idx" on "job" ("status", "available_at");

-- Idempotent enqueue: at most one ACTIVE job per dedupe key (partial unique). A
-- null dedupe_key never collides, so unkeyed jobs are never deduplicated.
create unique index "job_dedupe_active_idx" on "job" ("dedupe_key") where "status" in ('ready', 'processing');

-- Operator queries by project.
create index "job_project_idx" on "job" ("project_id");
