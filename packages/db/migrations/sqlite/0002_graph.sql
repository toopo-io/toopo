-- Deterministic code graph (ADR-0017 section 5, ADR-0015): one node table and
-- one edge table, single-table-inheritance over the universal kinds. Structural
-- fields are indexed columns, the open properties bag and the variable-shape
-- location and call-site payload are JSON (text here, jsonb on Postgres). No
-- foreign keys, because edge targets may be external/unresolved identities with
-- no node row (ADR-0015 Fork 1), so integrity is logical, validated by core Zod.
create table "node" ("id" text not null primary key, "kind" text not null, "sub_kind" text, "name" text, "path" text, "content_hash" text, "version" text, "enclosing_symbol_id" text, "callee" text, "ordinal" integer, "analysis_status" text, "analysis_reason" text, "file_id" text, "location" text, "payload" text, "properties" text not null default '{}');

create index "node_kind_idx" on "node" ("kind");

create index "node_sub_kind_idx" on "node" ("sub_kind");

create index "node_content_hash_idx" on "node" ("content_hash");

create index "node_file_id_idx" on "node" ("file_id");

-- Forward edges stored once (ADR-0015 section 11). edge_key is the deterministic
-- encoding of the canonical identity tuple, so re-persist is an idempotent upsert.
create table "edge" ("edge_key" text not null primary key, "source_id" text not null, "target_id" text not null, "kind" text not null, "sub_kind" text, "resolution" text not null, "confidence" text, "provenance_pass" text not null, "provenance_rule" text not null, "file_id" text, "properties" text not null default '{}');

-- Forward (what X depends on) and reverse (who depends on X, the blast-radius
-- index) traversal. Reverse is an index, never duplicated rows.
create index "edge_source_idx" on "edge" ("source_id", "kind");

create index "edge_target_idx" on "edge" ("target_id", "kind");

create index "edge_file_id_idx" on "edge" ("file_id");
