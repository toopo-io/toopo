-- ADR-0020 (Serve pass) A1: call-site lookup index — the Postgres mirror of the
-- sqlite migration. The Serve node-detail view zooms a symbol in to its
-- call-sites (ADR-0015 section 3, section 7), queried by enclosing_symbol_id.
-- Additive index only — no schema redesign. The name-search index is deferred,
-- since a bounded LIKE suffices at this scale (escalate only if profiling shows
-- it is needed).
create index "node_enclosing_symbol_id_idx" on "node" ("enclosing_symbol_id");
