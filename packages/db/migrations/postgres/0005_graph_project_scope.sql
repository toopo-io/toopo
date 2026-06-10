-- Graph project scoping (ADR-0022 §3): the Postgres mirror of the sqlite
-- migration. Identical structure. JSON columns are jsonb. project_id is part of
-- the PRIMARY KEY (node(project_id, id), edge(project_id, edge_key)) so the same
-- SymbolId can live in many projects, and every index leads with project_id.
--
-- The graph tables are greenfield (ADR-0017 §2) and hold only reproducible
-- dogfood data, so this drops and recreates them rather than altering a PRIMARY
-- KEY. The worker re-ingests clean under a project (ADR-0022 §6). No data is
-- preserved by design.
drop table if exists "edge";

drop table if exists "node";

create table "node" ("project_id" text not null, "id" text not null, "kind" text not null, "sub_kind" text, "name" text, "path" text, "content_hash" text, "version" text, "enclosing_symbol_id" text, "callee" text, "ordinal" integer, "analysis_status" text, "analysis_reason" text, "file_id" text, "location" jsonb, "payload" jsonb, "properties" jsonb not null default '{}', primary key ("project_id", "id"));

create index "node_kind_idx" on "node" ("project_id", "kind");

create index "node_sub_kind_idx" on "node" ("project_id", "sub_kind");

create index "node_content_hash_idx" on "node" ("project_id", "content_hash");

create index "node_file_id_idx" on "node" ("project_id", "file_id");

create index "node_enclosing_symbol_id_idx" on "node" ("project_id", "enclosing_symbol_id");

create table "edge" ("project_id" text not null, "edge_key" text not null, "source_id" text not null, "target_id" text not null, "kind" text not null, "sub_kind" text, "resolution" text not null, "confidence" text, "provenance_pass" text not null, "provenance_rule" text not null, "file_id" text, primary key ("project_id", "edge_key"));

create index "edge_source_idx" on "edge" ("project_id", "source_id", "kind");

create index "edge_target_idx" on "edge" ("project_id", "target_id", "kind");

create index "edge_file_id_idx" on "edge" ("project_id", "file_id");
