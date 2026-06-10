-- Parse-fragment cache (ADR-0025 Decision 3): a content-addressed cache of
-- per-file parse output, so a file unchanged since the last push — or identical
-- across projects — is a cache HIT and skips re-parsing (the delta-only win). The
-- key is OPAQUE to the store: the worker namespaces the file content hash by the
-- parse format version, so a parser/format change yields fresh keys and never a
-- stale hit. GC of dead entries is deferred (ADR-0025) — the cache is append-only
-- and reference-only (it holds only what re-parsing would reproduce, never tenant
-- data), so it is GLOBAL, not project-scoped: identical bytes parse identically.
create table "parse_fragment" ("cache_key" text not null primary key, "fragment" text not null);
