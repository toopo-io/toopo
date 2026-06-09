-- ADR-0020 (Serve pass) A1: call-site lookup index. The Serve node-detail view
-- zooms a symbol in to its call-sites (ADR-0015 section 3, section 7), which are
-- queried by the enclosing_symbol_id column. Additive index only — no schema
-- redesign. The name-search index is deliberately deferred: a bounded LIKE is
-- adequate at the current graph scale, to be added only if profiling demands it.
create index "node_enclosing_symbol_id_idx" on "node" ("enclosing_symbol_id");
