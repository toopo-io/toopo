/**
 * Airtight post-move leak proof (ADR-0028, Phase 5) — the data-layer guarantee
 * behind the move endpoint. Moving a project changes ONLY `project.workspace_id`;
 * because access is `isMember(user, project.workspace_id)` (the exact predicate the
 * ProjectAccessGuard runs) and the listing is keyed by `workspace_id`, relocating
 * the project must instantly transfer access — the source-only member LOSES it and
 * a target member GAINS it — with no membership row touched.
 *
 * Unlike the repository unit specs (one table), this exercises BOTH real
 * repositories over ONE real database, on both backends, so the assertion runs
 * where `workspace_id` genuinely drives access — not against a fake.
 */
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR } from '../migrations-dir.js';
import { migrateToLatest } from '../migrator.js';
import type { AuthDatabase } from '../schema/auth-types.js';
import type { ProjectDatabase } from '../schema/project-types.js';
import { type BackendHarness, SKIP_POSTGRES, startBackend } from '../test-support/backends.js';
import { dbBoolean } from '../test-support/column-values.js';
import { KyselyMembershipRepository } from './membership.repository.kysely.js';
import { KyselyProjectRepository } from './project.repository.kysely.js';
import type { ProjectRecord } from './project-records.js';

const backends = [
  { backend: 'sqlite' as const, skip: false },
  { backend: 'postgres' as const, skip: SKIP_POSTGRES },
];

for (const { backend, skip } of backends) {
  describe.skipIf(skip)(`workspace move transfers access [${backend}] (ADR-0028, Phase 5)`, () => {
    let harness: BackendHarness;
    let memberships: KyselyMembershipRepository;
    let projects: KyselyProjectRepository;
    let project: ProjectRecord;

    /** The guard predicate verbatim: a user reaches a project iff a member of its workspace. */
    const canAccess = async (userId: string, target: ProjectRecord): Promise<boolean> =>
      memberships.isMember(userId, target.workspaceId);

    beforeAll(async () => {
      harness = await startBackend(backend);
      await migrateToLatest({ db: harness.db, backend, rootDir: MIGRATIONS_DIR });
      const authDb = harness.db as unknown as Kysely<AuthDatabase>;
      memberships = new KyselyMembershipRepository(authDb);
      projects = new KyselyProjectRepository(harness.db as unknown as Kysely<ProjectDatabase>);

      await authDb
        .insertInto('user')
        .values([
          {
            id: 'user-a',
            name: 'A',
            email: 'a@example.com',
            emailVerified: dbBoolean(backend, true),
            image: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            deletedAt: null,
          },
          {
            id: 'user-b',
            name: 'B',
            email: 'b@example.com',
            emailVerified: dbBoolean(backend, true),
            image: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            deletedAt: null,
          },
        ])
        .execute();
      await authDb
        .insertInto('organization')
        .values([
          {
            id: 'ws-a',
            name: 'A',
            slug: 'ws-a',
            logo: null,
            metadata: null,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
          {
            id: 'ws-b',
            name: 'B',
            slug: 'ws-b',
            logo: null,
            metadata: null,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ])
        .execute();
      await authDb
        .insertInto('member')
        .values([
          {
            id: 'm-a',
            organizationId: 'ws-a',
            userId: 'user-a',
            role: 'owner',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
          {
            id: 'm-b',
            organizationId: 'ws-b',
            userId: 'user-b',
            role: 'owner',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ])
        .execute();

      project = await projects.createProject({
        ownerUserId: 'user-a',
        workspaceId: 'ws-a',
        repoHost: 'github',
        repoOwner: 'acme',
        repoName: 'web',
      });
    }, 120_000);

    afterAll(async () => {
      await harness?.cleanup();
    });

    it('transfers access on move: the source-only member loses it, the target member gains it', async () => {
      // Before: A (member of ws-a) reaches it; B (member of ws-b only) does not.
      expect(await canAccess('user-a', project)).toBe(true);
      expect(await canAccess('user-b', project)).toBe(false);

      const moved = await projects.assignProjectToWorkspace(project.id, 'ws-b');
      expect(moved.workspaceId).toBe('ws-b');

      // After: access flipped — proven through the real isMember predicate.
      expect(await canAccess('user-a', moved)).toBe(false);
      expect(await canAccess('user-b', moved)).toBe(true);

      // And through the listing: it left ws-a, it joined ws-b.
      const inA = await projects.listProjectsInWorkspaces(['ws-a']);
      expect(inA.items.map((p) => p.id)).not.toContain(project.id);
      const inB = await projects.listProjectsInWorkspaces(['ws-b']);
      expect(inB.items.map((p) => p.id)).toContain(project.id);

      // No membership row moved — only the project's placement did.
      expect(await memberships.listWorkspaceIds('user-a')).toEqual(['ws-a']);
      expect(await memberships.listWorkspaceIds('user-b')).toEqual(['ws-b']);
    });
  });
}
