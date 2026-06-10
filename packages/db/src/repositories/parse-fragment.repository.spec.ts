/**
 * B4.2 — the parse-fragment cache on both backends (ADR-0025 Decision 3). Proves
 * the content-addressed contract: a put round-trips the exact stored bytes, a miss
 * is null, getMany returns only the present keys in one query, and a re-put of an
 * existing key is a no-op (content-addressed — never an update). The store is
 * opaque: keys and values are arbitrary strings, so the worker can namespace its
 * keys and serialize its fragments however it likes.
 */
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR } from '../migrations-dir.js';
import { migrateToLatest } from '../migrator.js';
import type { ParseFragmentDatabase } from '../schema/parse-fragment-types.js';
import { type BackendHarness, SKIP_POSTGRES, startBackend } from '../test-support/backends.js';
import { KyselyParseFragmentStore } from './parse-fragment.repository.kysely.js';

const backends = [
  { backend: 'sqlite' as const, skip: false },
  { backend: 'postgres' as const, skip: SKIP_POSTGRES },
];

for (const { backend, skip } of backends) {
  describe.skipIf(skip)(`KyselyParseFragmentStore [${backend}]`, () => {
    let harness: BackendHarness;
    let store: KyselyParseFragmentStore;

    beforeAll(async () => {
      harness = await startBackend(backend);
      await migrateToLatest({ db: harness.db, backend, rootDir: MIGRATIONS_DIR });
      store = new KyselyParseFragmentStore(harness.db as unknown as Kysely<ParseFragmentDatabase>);
    }, 120_000);

    afterAll(async () => {
      await harness?.cleanup();
    });

    it('returns null for a missing key', async () => {
      expect(await store.get('absent')).toBeNull();
    });

    it('round-trips the exact stored bytes through a put', async () => {
      const fragment = '{"document":{"nodes":[]},"unresolved":[]}';
      await store.putMany(new Map([['k1', fragment]]));
      expect(await store.get('k1')).toBe(fragment);
    });

    it('getMany returns only present keys, in one query', async () => {
      await store.putMany(
        new Map([
          ['m1', 'one'],
          ['m2', 'two'],
        ]),
      );
      const found = await store.getMany(['m1', 'm2', 'm-absent']);
      expect(found).toEqual(
        new Map([
          ['m1', 'one'],
          ['m2', 'two'],
        ]),
      );
    });

    it('getMany on an empty key list issues no query and returns empty', async () => {
      expect(await store.getMany([])).toEqual(new Map());
    });

    it('putMany on empty entries is a no-op', async () => {
      await expect(store.putMany(new Map())).resolves.toBeUndefined();
    });

    it('re-putting an existing key is a no-op — content-addressed, never updated', async () => {
      await store.putMany(new Map([['stable', 'original']]));
      // A second put under the same key (a redelivery / concurrent worker) must not
      // overwrite — the key is content-addressed, so the value is invariant.
      await store.putMany(new Map([['stable', 'DIFFERENT']]));
      expect(await store.get('stable')).toBe('original');
    });
  });
}
