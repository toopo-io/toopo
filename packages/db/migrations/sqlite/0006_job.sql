-- Job queue (ADR-0023): the durable store behind the DB-backed Queue impl. A job
-- carries a REFERENCE (project id + repo coords + commit sha), never code
-- (security baseline). Timestamps are stored as UTC ISO-8601 TEXT so the claim
-- predicate `available_at <= now` compares lexicographically == chronologically
-- (ADR-0023 section 5); `text` (not `date`) makes that TEXT affinity explicit, so
-- there is no NUMERIC-affinity coercion surprise on the ordering column.
--
-- No foreign key to `project`: project and queue are separate schema modules kept
-- physically separable (ADR-0017 section 7), the same no-FK stance the graph and
-- project modules take. Integrity is enforced at the application boundary.
create table "job" ("id" text not null primary key, "dedupe_key" text, "project_id" text not null, "repo_host" text not null, "repo_owner" text not null, "repo_name" text not null, "commit_sha" text not null, "status" text not null, "attempts" integer not null default 0, "available_at" text not null, "lease_until" text, "last_error" text, "created_at" text not null, "updated_at" text not null);

-- The claim scan: the oldest claimable job by (status, available_at).
create index "job_claim_idx" on "job" ("status", "available_at");

-- Idempotent enqueue: at most one ACTIVE job per dedupe key (partial unique). A
-- null dedupe_key never collides, so unkeyed jobs are never deduplicated.
create unique index "job_dedupe_active_idx" on "job" ("dedupe_key") where "status" in ('ready', 'processing');

-- Operator queries by project.
create index "job_project_idx" on "job" ("project_id");
