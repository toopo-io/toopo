-- RGPD soft-delete index (ADR-0013). Better Auth emits the `deletedAt` column
-- from additionalFields but not an index, so the scheduled hard-delete sweep
-- (deletedAt < now() - 30d) and the soft-delete auth guard get this follow-up.
create index "user_deletedAt_idx" on "user" ("deletedAt");
