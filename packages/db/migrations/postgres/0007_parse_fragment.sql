-- Parse-fragment cache (ADR-0025 Decision 3): the Postgres mirror of the sqlite
-- migration. The fragment is stored as `text` (not `jsonb`): the cache returns the
-- exact bytes it stored for the worker to deserialize and revalidate (ADR-0006),
-- so it must not be reformatted by jsonb normalization. Content-addressed and
-- append-only — see the sqlite migration for the full rationale.
create table "parse_fragment" ("cache_key" text not null primary key, "fragment" text not null);
