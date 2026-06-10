/**
 * Kysely implementation of {@link ParseFragmentStore}. Portable across both
 * backends (ADR-0017 §6): parameterized everywhere, `ON CONFLICT DO NOTHING`
 * (supported by both libSQL-SQLite and Postgres) for the idempotent put. The store
 * is content-addressed and append-only, so a put never updates an existing row.
 */
import type { Kysely } from 'kysely';
import type { ParseFragmentDatabase } from '../schema/parse-fragment-types.js';
import type { ParseFragmentStore } from './parse-fragment.repository.js';

/** Rows per bulk insert. Two narrow text columns, so 1000 stays well under
 *  SQLite's 32766 bound-parameter ceiling (2 params/row) on both drivers. */
const PUT_CHUNK = 1_000;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

export class KyselyParseFragmentStore implements ParseFragmentStore {
  constructor(private readonly db: Kysely<ParseFragmentDatabase>) {}

  async get(key: string): Promise<string | null> {
    const row = await this.db
      .selectFrom('parse_fragment')
      .select('fragment')
      .where('cache_key', '=', key)
      .executeTakeFirst();
    return row?.fragment ?? null;
  }

  async getMany(keys: readonly string[]): Promise<ReadonlyMap<string, string>> {
    const distinct = [...new Set(keys)];
    if (distinct.length === 0) {
      return new Map();
    }
    const rows = await this.db
      .selectFrom('parse_fragment')
      .select(['cache_key', 'fragment'])
      .where('cache_key', 'in', distinct)
      .execute();
    return new Map(rows.map((row) => [row.cache_key, row.fragment]));
  }

  async putMany(entries: ReadonlyMap<string, string>): Promise<void> {
    const rows = [...entries].map(([cache_key, fragment]) => ({ cache_key, fragment }));
    if (rows.length === 0) {
      return;
    }
    for (const batch of chunk(rows, PUT_CHUNK)) {
      await this.db
        .insertInto('parse_fragment')
        .values(batch)
        .onConflict((oc) => oc.column('cache_key').doNothing())
        .execute();
    }
  }
}
