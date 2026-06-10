-- Project tenancy (ADR-0022): the Postgres mirror of the sqlite migration.
-- Identical structure. Timestamps are timestamptz with a CURRENT_TIMESTAMP
-- default, matching the auth tables convention (0000_better_auth.sql).
--
-- `owner_user_id` is a LOGICAL reference to `user`("id"), deliberately NOT a SQL
-- foreign key: auth and project are separate schema modules (ADR-0017 §7) kept
-- physically separable for a future cloud split, so no cross-module FK is taken
-- (the same no-FK stance the graph module uses). Integrity is enforced at the
-- application boundary (the session owns the user id).
create table "project" ("id" text not null primary key, "owner_user_id" text not null, "repo_host" text not null, "repo_owner" text not null, "repo_name" text not null, "installation_id" text, "created_at" timestamptz default CURRENT_TIMESTAMP not null, "updated_at" timestamptz default CURRENT_TIMESTAMP not null);

-- One project per connected repo on an instance (idempotent connect).
create unique index "project_repo_idx" on "project" ("repo_host", "repo_owner", "repo_name");

-- List an owner's projects.
create index "project_owner_user_id_idx" on "project" ("owner_user_id");
