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
  /** Tenancy scope (ADR-0022 §3): part of the composite primary key with `id`. */
  project_id: string;
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

/**
 * Edges carry NO open `properties` bag: the core `EdgeSchema` is strict and
 * models only kind/subKind/source/target/provenance/resolution(+confidence).
 * The graph's open JSON bag lives on nodes only, so the edge table has no
 * `properties` column — adding edge properties later is an additive core +
 * migration change, never a dead write-only column here (YAGNI).
 */
export interface EdgeTable {
  /** Tenancy scope (ADR-0022 §3): part of the composite primary key with `edge_key`. */
  project_id: string;
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
}

/** The Kysely database schema for the graph module. */
export interface GraphDatabase {
  node: NodeTable;
  edge: EdgeTable;
}
