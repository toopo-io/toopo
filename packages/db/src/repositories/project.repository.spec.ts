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
        workspaceId: 'ws-acme',
        repoHost: 'github',
        repoOwner: 'acme',
        repoName: 'web',
      });
      api = await repository.createProject({
        ownerUserId: 'user-1',
        workspaceId: 'ws-acme',
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
      expect(web.archivedAt).toBeNull();
      expect(web.createdAt).toBeInstanceOf(Date);
      expect(web.updatedAt).toBeInstanceOf(Date);
    });

    it('round-trips the workspace_id (ADR-0028, Phase 2)', async () => {
      expect(web.workspaceId).toBe('ws-acme');
      const found = await repository.findProjectById(web.id);
      expect(found?.workspaceId).toBe('ws-acme');
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
          workspaceId: 'ws-acme',
          repoHost: 'github',
          repoOwner: 'acme',
          repoName: 'web',
        }),
      ).rejects.toThrow();
    });

    it('finds every project linked to an installation id', async () => {
      const linked = await repository.findProjectsByInstallationId('42');
      expect(linked.map((p) => p.id)).toEqual([api.id]);
      expect(await repository.findProjectsByInstallationId('nope')).toEqual([]);
    });

    it('soft-archives a project: it drops out of the listing but stays resolvable', async () => {
      const target = await repository.createProject({
        ownerUserId: 'user-1',
        workspaceId: 'ws-acme',
        repoHost: 'github',
        repoOwner: 'acme',
        repoName: 'archived-repo',
        installationId: '42',
      });

      await repository.archiveProject(target.id, new Date('2026-06-10T00:00:00Z'));

      const listed = await repository.listProjects();
      expect(listed.items.map((p) => p.id)).not.toContain(target.id);

      const resolved = await repository.findProjectByRepo('github', 'acme', 'archived-repo');
      expect(resolved?.id).toBe(target.id);
      expect(resolved?.archivedAt).toBeInstanceOf(Date);
    });

    it('revives an archived project, clearing the archive and refreshing the installation', async () => {
      const target = await repository.createProject({
        ownerUserId: 'user-1',
        workspaceId: 'ws-acme',
        repoHost: 'github',
        repoOwner: 'acme',
        repoName: 'revived-repo',
        installationId: '42',
      });
      await repository.archiveProject(target.id, new Date('2026-06-10T00:00:00Z'));

      await repository.reviveProject(target.id, '99');

      const revived = await repository.findProjectById(target.id);
      expect(revived?.archivedAt).toBeNull();
      expect(revived?.installationId).toBe('99');

      const listed = await repository.listProjects();
      expect(listed.items.map((p) => p.id)).toContain(target.id);
    });
  });
}
