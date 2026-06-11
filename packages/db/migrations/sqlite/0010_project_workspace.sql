-- Workspace tenancy link (ADR-0028, Phase 2): every project belongs to a
-- Workspace (a Better Auth organization). Access to a project's graph is granted
-- through MEMBERSHIP of project.workspace_id (Phase 3), so workspace is an authz
-- layer ABOVE project identity — the graph keys stay (project_id, ...), never the
-- workspace (ADR-0022 section 3). workspace_id is a LOGICAL no-FK reference to
-- organization("id"): organization is the auth schema module, project the project
-- module, and ADR-0017 section 7 forbids cross-module SQL FKs (the same stance
-- owner_user_id takes). Integrity is enforced at the application boundary.
--
-- The column lands NOT NULL. To get there on existing data it is backfilled in
-- three tiers before the constraint is enforced:
--   1. The owner's earliest workspace, if they already have a membership — the
--      exact rule MembershipRepository.findFirstWorkspaceId uses, so a project and
--      its owner's active session converge on one workspace.
--   2. Otherwise, synthesize the owner's personal workspace AT REST — the same
--      shape Phase 1b creates at runtime (name 'Personal', slug user-<id>, a
--      single owner member). The identical slug means a later first sign-in finds
--      it (slug is unique) and is a no-op: never a duplicate. The personal-
--      workspace convention is the single documented source in @toopo/db's
--      personal-workspace module; a parity test pins this SQL to it.
--   3. Truly unattributable projects (owner_user_id with no user row) go to one
--      shared sentinel workspace with NO members — inaccessible until an admin
--      reassigns, the correct posture under membership-based access.
--
-- SQLite cannot add a NOT NULL constraint to an existing column, so after the
-- backfill the table is rebuilt (create, copy, drop, rename) with workspace_id
-- NOT NULL and every index recreated. This mirrors the Postgres migration's net
-- effect; the divergence is only in HOW NOT NULL is reached. Synthetic ids use
-- randomblob (SQLite has no UUID function) and timestamps match Better Auth's ISO
-- format so the rows read back identically through its adapter.

-- 1) Add the column nullable so existing rows survive the backfill.
alter table "project" add column "workspace_id" text;

-- 2) Tier 1 — the owner's earliest existing membership.
update "project" set "workspace_id" = (
  select "m"."organizationId" from "member" "m"
  where "m"."userId" = "project"."owner_user_id"
  order by "m"."createdAt" asc, "m"."organizationId" asc
  limit 1
) where "workspace_id" is null;

-- 3) Tier 2 — synthesize the personal workspace for owners that exist but have no
--    membership: one organization (slug user-<id>) plus one owner member.
--    Guard invariant: the `not exists member` clause makes Tier 2 MUTUALLY
--    EXCLUSIVE with Tier 1 (an owner with any membership was already backfilled
--    there) and idempotent on re-run; the `not exists organization(slug)` clause
--    guarantees convergence with Phase 1b — a personal workspace created later at
--    runtime shares the unique slug, so neither side ever duplicates the other.
insert into "organization" ("id", "name", "slug", "logo", "createdAt", "metadata")
select lower(hex(randomblob(16))), 'Personal', 'user-' || "u"."id", null,
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), null
from "user" "u"
where exists (
        select 1 from "project" "p"
        where "p"."owner_user_id" = "u"."id" and "p"."workspace_id" is null
      )
  and not exists (select 1 from "member" "m" where "m"."userId" = "u"."id")
  and not exists (select 1 from "organization" "o" where "o"."slug" = 'user-' || "u"."id");

insert into "member" ("id", "organizationId", "userId", "role", "createdAt")
select lower(hex(randomblob(16))), "o"."id", "u"."id", 'owner',
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
from "user" "u"
join "organization" "o" on "o"."slug" = 'user-' || "u"."id"
where exists (
        select 1 from "project" "p"
        where "p"."owner_user_id" = "u"."id" and "p"."workspace_id" is null
      )
  and not exists (select 1 from "member" "m" where "m"."userId" = "u"."id");

update "project" set "workspace_id" = (
  select "o"."id" from "organization" "o" where "o"."slug" = 'user-' || "project"."owner_user_id"
) where "workspace_id" is null
  and exists (
    select 1 from "organization" "o" where "o"."slug" = 'user-' || "project"."owner_user_id"
  );

-- 4) Tier 3 — the members-less sentinel for unattributable projects.
insert into "organization" ("id", "name", "slug", "logo", "createdAt", "metadata")
select lower(hex(randomblob(16))), 'Orphaned projects', 'orphaned-workspace', null,
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), null
where exists (select 1 from "project" where "workspace_id" is null)
  and not exists (select 1 from "organization" "o" where "o"."slug" = 'orphaned-workspace');

update "project" set "workspace_id" = (
  select "o"."id" from "organization" "o" where "o"."slug" = 'orphaned-workspace'
) where "workspace_id" is null;

-- 5) Enforce NOT NULL via a table rebuild and recreate every index (the unique
--    repo index, the two list indexes, and the new workspace index). A missing
--    index here is silent — the migration test asserts the exact final schema.
create table "project_new" ("id" text not null primary key, "owner_user_id" text not null, "repo_host" text not null, "repo_owner" text not null, "repo_name" text not null, "installation_id" text, "workspace_id" text not null, "archived_at" date, "created_at" date not null, "updated_at" date not null);

insert into "project_new" ("id", "owner_user_id", "repo_host", "repo_owner", "repo_name", "installation_id", "workspace_id", "archived_at", "created_at", "updated_at")
select "id", "owner_user_id", "repo_host", "repo_owner", "repo_name", "installation_id", "workspace_id", "archived_at", "created_at", "updated_at"
from "project";

drop table "project";

alter table "project_new" rename to "project";

create unique index "project_repo_idx" on "project" ("repo_host", "repo_owner", "repo_name");
create index "project_owner_user_id_idx" on "project" ("owner_user_id");
create index "project_archived_at_idx" on "project" ("archived_at");
create index "project_workspace_id_idx" on "project" ("workspace_id");
