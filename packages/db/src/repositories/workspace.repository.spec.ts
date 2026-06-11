/**
 * Workspace existence read — `exists` on both backends. Seeds one organization
 * and asserts a present id resolves true and an absent one false. Better Auth
 * owns the writes in production; here we insert the row directly to exercise the
 * read in isolation (ADR-0028). This is the seam the worker uses to refuse a
 * project attributed to an unreal workspace.
 */
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR } from '../migrations-dir.js';
import { migrateToLatest } from '../migrator.js';
import type { AuthDatabase } from '../schema/auth-types.js';
import { type BackendHarness, SKIP_POSTGRES, startBackend } from '../test-support/backends.js';
import { KyselyWorkspaceRepository } from './workspace.repository.kysely.js';

const backends = [
  { backend: 'sqlite' as const, skip: false },
  { backend: 'postgres' as const, skip: SKIP_POSTGRES },
];

for (const { backend, skip } of backends) {
  describe.skipIf(skip)(`KyselyWorkspaceRepository [${backend}]`, () => {
    let harness: BackendHarness;
    let repository: KyselyWorkspaceRepository;

    beforeAll(async () => {
      harness = await startBackend(backend);
      await migrateToLatest({ db: harness.db, backend, rootDir: MIGRATIONS_DIR });
      const db = harness.db as unknown as Kysely<AuthDatabase>;
      repository = new KyselyWorkspaceRepository(db);
      await db
        .insertInto('organization')
        .values({
          id: 'ws-real',
          name: 'Personal',
          slug: 'user-1',
          logo: null,
          metadata: null,
          createdAt: '2026-01-01T00:00:00.000Z',
        })
        .execute();
    }, 120_000);

    afterAll(async () => {
      await harness?.cleanup();
    });

    it('returns true for an existing workspace and false for an absent one', async () => {
      expect(await repository.exists('ws-real')).toBe(true);
      expect(await repository.exists('ws-missing')).toBe(false);
    });
  });
}
