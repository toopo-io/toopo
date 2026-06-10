/**
 * Kysely table type for the parse-fragment cache (ADR-0025 Decision 3), matching
 * the committed `0007_parse_fragment.sql` on both backends. A content-addressed
 * blob store: the `cache_key` is an opaque string the worker derives (file content
 * hash namespaced by parse format version); `fragment` is the serialized parse
 * output, stored and returned verbatim for the worker to deserialize and revalidate
 * at its own boundary (ADR-0006). Global — not project-scoped — because identical
 * bytes parse identically everywhere.
 */
export interface ParseFragmentTable {
  cache_key: string;
  fragment: string;
}

/** The Kysely database schema for the parse-fragment cache module. */
export interface ParseFragmentDatabase {
  parse_fragment: ParseFragmentTable;
}
