-- GitHub-App connect (ADR-0026): the Postgres mirror of the sqlite migration.
--
-- 1) project.archived_at — uninstall / repo-removed soft-archives a project
--    (ADR-0026 §7): the graph is preserved and re-connect is reversible, and the
--    picker filters archived rows out. Nullable timestamptz; null means active.
alter table "project" add column "archived_at" timestamptz;

-- The active-project listing filter (the picker lists archived_at IS NULL only).
create index "project_archived_at_idx" on "project" ("archived_at");

-- 2) github_installation — the first-class installation entity (ADR-0026 §3): the
--    installation_id ⇄ owner_user_id link the post-install redirect records and
--    the (anonymous) installation webhooks resolve the owner through. No SQL
--    foreign key to `user` — separate schema modules (ADR-0017 §7), the same
--    no-FK stance the project module takes; integrity at the application boundary.
create table "github_installation" ("installation_id" text not null primary key, "owner_user_id" text not null, "created_at" timestamptz default CURRENT_TIMESTAMP not null, "updated_at" timestamptz default CURRENT_TIMESTAMP not null);

-- List an owner's installations.
create index "github_installation_owner_user_id_idx" on "github_installation" ("owner_user_id");
