/**
 * The parse-fragment cache abstraction (ADR-0025 Decision 3, ADR-0017 §1 repository
 * pattern). Callers depend on this interface, never on Kysely. It is a generic
 * content-addressed blob store: the key and value are opaque strings, so the store
 * carries no knowledge of `@toopo/parser`'s `ParseResult` — the worker owns the key
 * derivation (content hash × format version) and the serialize/validate boundary
 * (ADR-0006), keeping `@toopo/db` decoupled from the pipeline.
 *
 * It enables the delta-only win: a file whose bytes are unchanged since the last
 * push — or shared across projects — is a cache HIT, so its fragment is reused and
 * the file is never re-parsed (the dominant cost, ADR-0016).
 */
export interface ParseFragmentStore {
  /** The cached fragment for a key, or `null` on a miss. */
  get(key: string): Promise<string | null>;

  /**
   * The cached fragments for many keys in ONE query, keyed by the cache key —
   * absent keys are simply omitted. The worker looks up every file of a commit at
   * once, so a per-file round-trip is avoided.
   */
  getMany(keys: readonly string[]): Promise<ReadonlyMap<string, string>>;

  /**
   * Cache many fragments in one batched, idempotent write. A key is content-
   * addressed (same key ⇒ same bytes ⇒ same fragment), so a re-put of an existing
   * key is a no-op (`ON CONFLICT DO NOTHING`) — never an update.
   */
  putMany(entries: ReadonlyMap<string, string>): Promise<void>;
}
