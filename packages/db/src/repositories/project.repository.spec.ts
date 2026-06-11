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

    it('lists a workspace projects, keyset-paginated (ADR-0028, Phase 3)', async () => {
      const all = await repository.listProjectsInWorkspaces(['ws-acme']);
      expect(all.nextCursor).toBeNull();
      expect(all.items.map((p) => p.id).sort()).toEqual([web.id, api.id].sort());

      const firstPage = await repository.listProjectsInWorkspaces(['ws-acme'], { limit: 1 });
      expect(firstPage.items).toHaveLength(1);
      expect(firstPage.nextCursor).not.toBeNull();

      const secondPage = await repository.listProjectsInWorkspaces(['ws-acme'], {
        limit: 1,
        cursor: firstPage.nextCursor ?? undefined,
      });
      const seen = [...firstPage.items, ...secondPage.items].map((p) => p.id);
      expect(new Set(seen)).toEqual(new Set([web.id, api.id]));
    });

    it('scopes the listing to the given workspaces and isolates a foreign one', async () => {
      // A project in another workspace is never listed for ws-acme.
      const foreign = await repository.createProject({
        ownerUserId: 'user-9',
        workspaceId: 'ws-other',
        repoHost: 'github',
        repoOwner: 'other',
        repoName: 'repo',
      });
      const acme = await repository.listProjectsInWorkspaces(['ws-acme']);
      expect(acme.items.map((p) => p.id)).not.toContain(foreign.id);

      const other = await repository.listProjectsInWorkspaces(['ws-other']);
      expect(other.items.map((p) => p.id)).toEqual([foreign.id]);

      // An empty workspace set sees nothing.
      const none = await repository.listProjectsInWorkspaces([]);
      expect(none.items).toEqual([]);
      expect(none.nextCursor).toBeNull();
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

      const listed = await repository.listProjectsInWorkspaces(['ws-acme']);
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
      // No workspace argument given → the placement is left untouched.
      expect(revived?.workspaceId).toBe('ws-acme');

      const listed = await repository.listProjectsInWorkspaces(['ws-acme']);
      expect(listed.items.map((p) => p.id)).toContain(target.id);
    });

    it('re-homes a revived project to the given workspace (ADR-0028)', async () => {
      const target = await repository.createProject({
        ownerUserId: 'user-1',
        workspaceId: 'orphaned-workspace',
        repoHost: 'github',
        repoOwner: 'acme',
        repoName: 'rehomed-repo',
        installationId: '42',
      });
      await repository.archiveProject(target.id, new Date('2026-06-10T00:00:00Z'));

      await repository.reviveProject(target.id, '99', 'ws-acme');

      const revived = await repository.findProjectById(target.id);
      expect(revived?.archivedAt).toBeNull();
      expect(revived?.installationId).toBe('99');
      // Re-homed: the project now lives in (and is listed under) the new workspace.
      expect(revived?.workspaceId).toBe('ws-acme');
      const listed = await repository.listProjectsInWorkspaces(['ws-acme']);
      expect(listed.items.map((p) => p.id)).toContain(target.id);
    });

    it('assigns a project to another workspace, changing only its placement (ADR-0028, Phase 5)', async () => {
      const target = await repository.createProject({
        ownerUserId: 'user-1',
        workspaceId: 'ws-source',
        repoHost: 'github',
        repoOwner: 'acme',
        repoName: 'movable-repo',
        installationId: '42',
      });

      const moved = await repository.assignProjectToWorkspace(target.id, 'ws-target');

      // The returned record is the fresh, authoritative row (the repository owns
      // `updated_at`), re-homed to the target and nothing else touched.
      expect(moved.workspaceId).toBe('ws-target');
      expect(moved.installationId).toBe('42');
      expect(moved.ownerUserId).toBe('user-1');
      expect(moved.repoName).toBe('movable-repo');
      expect(moved.archivedAt).toBeNull();
      expect(moved.updatedAt.getTime()).toBeGreaterThanOrEqual(target.updatedAt.getTime());
      // It persisted: the source no longer lists it, the target does.
      const source = await repository.listProjectsInWorkspaces(['ws-source']);
      expect(source.items.map((p) => p.id)).not.toContain(target.id);
      const dest = await repository.listProjectsInWorkspaces(['ws-target']);
      expect(dest.items.map((p) => p.id)).toContain(target.id);
    });

    it('treats assigning to the current workspace as an idempotent no-op (ADR-0028, Phase 5)', async () => {
      const target = await repository.createProject({
        ownerUserId: 'user-1',
        workspaceId: 'ws-stay',
        repoHost: 'github',
        repoOwner: 'acme',
        repoName: 'staying-repo',
      });

      const same = await repository.assignProjectToWorkspace(target.id, 'ws-stay');

      expect(same.workspaceId).toBe('ws-stay');
      expect(same.id).toBe(target.id);
      const listed = await repository.listProjectsInWorkspaces(['ws-stay']);
      expect(listed.items.map((p) => p.id)).toContain(target.id);
    });
  });
}
