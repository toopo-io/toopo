-- Project tenancy (ADR-0022): an administrative "connected repo" entity, the
-- scope every code graph is partitioned by. Distinct from the graph `repo` node
-- (ADR-0015 §2) — this is the connection/tenancy record, not graph identity.
--
-- `owner_user_id` is a LOGICAL reference to `user`("id"), deliberately NOT a SQL
-- foreign key: auth and project are separate schema modules (ADR-0017 §7) kept
-- physically separable for a future cloud split, so no cross-module FK is taken
-- (the same no-FK stance the graph module uses). Integrity is enforced at the
-- application boundary (the session owns the user id).
create table "project" ("id" text not null primary key, "owner_user_id" text not null, "repo_host" text not null, "repo_owner" text not null, "repo_name" text not null, "installation_id" text, "created_at" date not null, "updated_at" date not null);

-- One project per connected repo on an instance (idempotent connect).
create unique index "project_repo_idx" on "project" ("repo_host", "repo_owner", "repo_name");

-- List an owner's projects.
create index "project_owner_user_id_idx" on "project" ("owner_user_id");
