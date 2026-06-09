/**
 * Kysely table types for the graph schema module (ADR-0017 §5, §7), matching the
 * committed `0002_graph.sql` on both backends. Single-table-inheritance: one
 * `node` table over the five universal node kinds, one `edge` table over the
 * closed edge-kind set (ADR-0015 §5).
 *
 * The JSON columns (`location`, `payload`, `properties`) are written as
 * stringified JSON (accepted by both libSQL `text` and Postgres `jsonb`), but
 * read back in the driver's NATIVE shape — a parsed object on Postgres `jsonb`,
 * a raw string on libSQL `text`. That asymmetry is normalized at the repository
 * boundary (ADR-0006, ADR-0017 §10), so the select type is `unknown` to force a
 * narrowing read; the insert/update type is the JSON string we control.
 */
import type { ColumnType } from 'kysely';

/** A non-null JSON column: read back native (unknown), written as a JSON string. */
type JsonColumn = ColumnType<unknown, string, string>;

/** A nullable JSON column: same readback asymmetry, with null permitted. */
type NullableJsonColumn = ColumnType<unknown | null, string | null, string | null>;

export interface NodeTable {
  id: string;
  kind: string;
  sub_kind: string | null;
  name: string | null;
  path: string | null;
  content_hash: string | null;
  version: string | null;
  enclosing_symbol_id: string | null;
  callee: string | null;
  ordinal: number | null;
  analysis_status: string | null;
  analysis_reason: string | null;
  file_id: string | null;
  location: NullableJsonColumn;
  payload: NullableJsonColumn;
  properties: JsonColumn;
}

export interface EdgeTable {
  edge_key: string;
  source_id: string;
  target_id: string;
  kind: string;
  sub_kind: string | null;
  resolution: string;
  confidence: string | null;
  provenance_pass: string;
  provenance_rule: string;
  file_id: string | null;
  properties: JsonColumn;
}

/** The Kysely database schema for the graph module. */
export interface GraphDatabase {
  node: NodeTable;
  edge: EdgeTable;
}
