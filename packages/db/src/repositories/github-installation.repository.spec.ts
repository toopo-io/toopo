/**
 * GitHub-App installation repository — link, find, delete, on both backends
 * (ADR-0017 §6, ADR-0026 §3 + §7 hardening). Asserts: a link round-trips with
 * coerced dates, a same-owner re-link is idempotent (created_at preserved), a
 * cross-owner re-link is refused with the stored row untouched, a deleted link
 * frees the id for a new owner, finding an absent id returns null, and delete is
 * idempotent.
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

    it('links an installation and round-trips it with coerced dates', async () => {
      const result = await repository.linkInstallation({
        installationId: '100',
        ownerUserId: 'user-1',
      });
      expect(result.outcome).toBe('linked');
      if (result.outcome !== 'linked') {
        return;
      }
      expect(result.record.installationId).toBe('100');
      expect(result.record.ownerUserId).toBe('user-1');
      expect(result.record.createdAt).toBeInstanceOf(Date);
      expect(result.record.updatedAt).toBeInstanceOf(Date);

      const found = await repository.findInstallation('100');
      expect(found?.ownerUserId).toBe('user-1');
    });

    it('re-links the SAME owner idempotently, preserving created_at', async () => {
      const first = await repository.linkInstallation({
        installationId: '200',
        ownerUserId: 'user-1',
      });
      const second = await repository.linkInstallation({
        installationId: '200',
        ownerUserId: 'user-1',
      });
      expect(first.outcome).toBe('linked');
      expect(second.outcome).toBe('linked');
      if (first.outcome !== 'linked' || second.outcome !== 'linked') {
        return;
      }
      expect(second.record.ownerUserId).toBe('user-1');
      expect(second.record.createdAt.getTime()).toBe(first.record.createdAt.getTime());
    });

    it('refuses to re-point a link held by a DIFFERENT owner, leaving the row untouched', async () => {
      const held = await repository.linkInstallation({
        installationId: '250',
        ownerUserId: 'user-1',
      });
      const hijack = await repository.linkInstallation({
        installationId: '250',
        ownerUserId: 'user-2',
      });
      expect(hijack.outcome).toBe('owner-mismatch');

      const persisted = await repository.findInstallation('250');
      expect(persisted?.ownerUserId).toBe('user-1');
      if (held.outcome === 'linked') {
        expect(persisted?.updatedAt.getTime()).toBe(held.record.updatedAt.getTime());
      }
    });

    it('links a NEW owner after the previous link was deleted (real uninstall)', async () => {
      await repository.linkInstallation({ installationId: '260', ownerUserId: 'user-1' });
      await repository.deleteInstallation('260');
      const relinked = await repository.linkInstallation({
        installationId: '260',
        ownerUserId: 'user-2',
      });
      expect(relinked.outcome).toBe('linked');
      expect((await repository.findInstallation('260'))?.ownerUserId).toBe('user-2');
    });

    it('returns null for an absent installation id', async () => {
      expect(await repository.findInstallation('does-not-exist')).toBeNull();
    });

    it('deletes a link and is idempotent for an absent id', async () => {
      await repository.linkInstallation({ installationId: '300', ownerUserId: 'user-1' });
      await repository.deleteInstallation('300');
      expect(await repository.findInstallation('300')).toBeNull();
      await expect(repository.deleteInstallation('300')).resolves.toBeUndefined();
    });
  });
}
