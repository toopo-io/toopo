/**
 * GitHub-App installation repository — upsert link, find, delete, on both backends
 * (ADR-0017 §6, ADR-0026 §3). Asserts: a link round-trips with coerced dates, a
 * re-upsert re-links the owner while preserving created_at (idempotent on the
 * installation id), finding an absent id returns null, and delete is idempotent.
 */
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR } from '../migrations-dir.js';
import { migrateToLatest } from '../migrator.js';
import type { ProjectDatabase } from '../schema/project-types.js';
import { type BackendHarness, SKIP_POSTGRES, startBackend } from '../test-support/backends.js';
import { KyselyGithubInstallationRepository } from './github-installation.repository.kysely.js';

const backends = [
  { backend: 'sqlite' as const, skip: false },
  { backend: 'postgres' as const, skip: SKIP_POSTGRES },
];

for (const { backend, skip } of backends) {
  describe.skipIf(skip)(`KyselyGithubInstallationRepository [${backend}]`, () => {
    let harness: BackendHarness;
    let repository: KyselyGithubInstallationRepository;

    beforeAll(async () => {
      harness = await startBackend(backend);
      await migrateToLatest({ db: harness.db, backend, rootDir: MIGRATIONS_DIR });
      repository = new KyselyGithubInstallationRepository(
        harness.db as unknown as Kysely<ProjectDatabase>,
      );
    }, 120_000);

    afterAll(async () => {
      await harness?.cleanup();
    });

    it('upserts a link and round-trips it with coerced dates', async () => {
      const record = await repository.upsertInstallation({
        installationId: '100',
        ownerUserId: 'user-1',
      });
      expect(record.installationId).toBe('100');
      expect(record.ownerUserId).toBe('user-1');
      expect(record.createdAt).toBeInstanceOf(Date);
      expect(record.updatedAt).toBeInstanceOf(Date);

      const found = await repository.findInstallation('100');
      expect(found?.ownerUserId).toBe('user-1');
    });

    it('re-links the owner on a second upsert, preserving created_at', async () => {
      const first = await repository.upsertInstallation({
        installationId: '200',
        ownerUserId: 'user-1',
      });
      const second = await repository.upsertInstallation({
        installationId: '200',
        ownerUserId: 'user-2',
      });
      expect(second.ownerUserId).toBe('user-2');
      expect(second.createdAt.getTime()).toBe(first.createdAt.getTime());
    });

    it('returns null for an absent installation id', async () => {
      expect(await repository.findInstallation('does-not-exist')).toBeNull();
    });

    it('deletes a link and is idempotent for an absent id', async () => {
      await repository.upsertInstallation({ installationId: '300', ownerUserId: 'user-1' });
      await repository.deleteInstallation('300');
      expect(await repository.findInstallation('300')).toBeNull();
      await expect(repository.deleteInstallation('300')).resolves.toBeUndefined();
    });
  });
}
