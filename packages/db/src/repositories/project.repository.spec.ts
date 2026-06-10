/**
 * Project repository — createProject + finders + keyset listing on both backends
 * (ADR-0017 §6, ADR-0022). Persists a couple of connected repos, then asserts:
 * records rehydrate losslessly with coerced dates, the optional installation id
 * round-trips, finders return null for absent rows, listing is keyset-paginated,
 * and the per-instance repo-uniqueness index rejects a duplicate connect.
 */
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR } from '../migrations-dir.js';
import { migrateToLatest } from '../migrator.js';
import type { ProjectDatabase } from '../schema/project-types.js';
import { type BackendHarness, SKIP_POSTGRES, startBackend } from '../test-support/backends.js';
import { KyselyProjectRepository } from './project.repository.kysely.js';
import type { ProjectRecord } from './project-records.js';

const backends = [
  { backend: 'sqlite' as const, skip: false },
  { backend: 'postgres' as const, skip: SKIP_POSTGRES },
];

for (const { backend, skip } of backends) {
  describe.skipIf(skip)(`KyselyProjectRepository [${backend}]`, () => {
    let harness: BackendHarness;
    let repository: KyselyProjectRepository;
    let web: ProjectRecord;
    let api: ProjectRecord;

    beforeAll(async () => {
      harness = await startBackend(backend);
      await migrateToLatest({ db: harness.db, backend, rootDir: MIGRATIONS_DIR });
      repository = new KyselyProjectRepository(harness.db as unknown as Kysely<ProjectDatabase>);
      web = await repository.createProject({
        ownerUserId: 'user-1',
        repoHost: 'github',
        repoOwner: 'acme',
        repoName: 'web',
      });
      api = await repository.createProject({
        ownerUserId: 'user-1',
        repoHost: 'github',
        repoOwner: 'acme',
        repoName: 'api',
        installationId: '42',
      });
    }, 120_000);

    afterAll(async () => {
      await harness?.cleanup();
    });

    it('returns a well-formed record with a generated id and coerced dates', () => {
      expect(web.id).toMatch(/[0-9a-f-]{36}/);
      expect(web.ownerUserId).toBe('user-1');
      expect(web.repoHost).toBe('github');
      expect(web.repoOwner).toBe('acme');
      expect(web.repoName).toBe('web');
      expect(web.installationId).toBeNull();
      expect(web.createdAt).toBeInstanceOf(Date);
      expect(web.updatedAt).toBeInstanceOf(Date);
    });

    it('round-trips an optional installation id', () => {
      expect(api.installationId).toBe('42');
    });

    it('finds a project by id and returns null for an absent id', async () => {
      const found = await repository.findProjectById(web.id);
      expect(found?.id).toBe(web.id);
      expect(found?.repoName).toBe('web');
      expect(found?.createdAt.getTime()).toBe(web.createdAt.getTime());
      expect(await repository.findProjectById('does-not-exist')).toBeNull();
    });

    it('finds a project by repo triple and returns null for an absent one', async () => {
      const found = await repository.findProjectByRepo('github', 'acme', 'api');
      expect(found?.id).toBe(api.id);
      expect(await repository.findProjectByRepo('github', 'acme', 'missing')).toBeNull();
    });

    it('lists the instance projects, keyset-paginated', async () => {
      const all = await repository.listProjects();
      expect(all.nextCursor).toBeNull();
      expect(all.items.map((p) => p.id).sort()).toEqual([web.id, api.id].sort());

      const firstPage = await repository.listProjects({ limit: 1 });
      expect(firstPage.items).toHaveLength(1);
      expect(firstPage.nextCursor).not.toBeNull();

      const secondPage = await repository.listProjects({
        limit: 1,
        cursor: firstPage.nextCursor ?? undefined,
      });
      const seen = [...firstPage.items, ...secondPage.items].map((p) => p.id);
      expect(new Set(seen)).toEqual(new Set([web.id, api.id]));
    });

    it('rejects a duplicate connect for the same repo triple', async () => {
      await expect(
        repository.createProject({
          ownerUserId: 'user-2',
          repoHost: 'github',
          repoOwner: 'acme',
          repoName: 'web',
        }),
      ).rejects.toThrow();
    });
  });
}
