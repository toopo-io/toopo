-- Workspace tenancy link (ADR-0028, Phase 2): the Postgres mirror of the sqlite
-- migration. Same three-tier backfill and the same end state. Postgres reaches
-- NOT NULL with a direct ALTER COLUMN (no table rebuild) and generates synthetic
-- ids with gen_random_uuid() (built into Postgres 13+). See the sqlite migration
-- for the full rationale on the tenancy model and the personal-workspace parity.

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
select gen_random_uuid()::text, 'Personal', 'user-' || "u"."id", null, CURRENT_TIMESTAMP, null
from "user" "u"
where exists (
        select 1 from "project" "p"
        where "p"."owner_user_id" = "u"."id" and "p"."workspace_id" is null
      )
  and not exists (select 1 from "member" "m" where "m"."userId" = "u"."id")
  and not exists (select 1 from "organization" "o" where "o"."slug" = 'user-' || "u"."id");

insert into "member" ("id", "organizationId", "userId", "role", "createdAt")
select gen_random_uuid()::text, "o"."id", "u"."id", 'owner', CURRENT_TIMESTAMP
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
select gen_random_uuid()::text, 'Orphaned projects', 'orphaned-workspace', null, CURRENT_TIMESTAMP, null
where exists (select 1 from "project" where "workspace_id" is null)
  and not exists (select 1 from "organization" "o" where "o"."slug" = 'orphaned-workspace');

update "project" set "workspace_id" = (
  select "o"."id" from "organization" "o" where "o"."slug" = 'orphaned-workspace'
) where "workspace_id" is null;

-- 5) Enforce NOT NULL (in place — Postgres needs no table rebuild) and index it.
alter table "project" alter column "workspace_id" set not null;

create index "project_workspace_id_idx" on "project" ("workspace_id");
