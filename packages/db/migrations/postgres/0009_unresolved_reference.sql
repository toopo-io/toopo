-- Persisted unresolved references (ADR-0016 amendment, ADR-0020 catalog; C11):
-- the Postgres mirror of the sqlite migration. The honest tail of the Resolve
-- pass — an import/usage that could not be bound to a precise symbol — kept as a
-- first-class, project-scoped sibling of the graph (NOT a fabricated edge), so a
-- later "unused"/"cycle" view never reads a resolution gap as genuine absence.
--
-- project_id is part of the PRIMARY KEY (project_id, ref_key), matching node/edge
-- (ADR-0022 §3). ref_key is a deterministic encoding of the reference identity
-- (importer + code + specifier + name), so re-persisting the same analysis is a
-- no-op on row count. target_file_id (the resolved module of an *-export gap) is
-- indexed with project_id so "does this file have an unresolved inbound usage?"
-- is a scoped lookup.
create table "unresolved_reference" ("project_id" text not null, "ref_key" text not null, "importer_file_id" text not null, "code" text not null, "specifier" text not null, "target_file_id" text, "name" text, "message" text not null, primary key ("project_id", "ref_key"));

create index "unresolved_reference_target_idx" on "unresolved_reference" ("project_id", "target_file_id");
