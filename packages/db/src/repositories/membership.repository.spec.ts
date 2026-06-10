/**
 * Membership read primitive — `findFirstWorkspaceId` on both backends. Seeds a
 * user with two workspace memberships created at different times and asserts the
 * earliest one is returned deterministically, and that a user with no membership
 * resolves to null. Better Auth owns the writes in production; here we insert the
 * rows directly to exercise the read in isolation (ADR-0028, Phase 1b).
 */
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR } from '../migrations-dir.js';
import { migrateToLatest } from '../migrator.js';
import type { AuthDatabase } from '../schema/auth-types.js';
import { type BackendHarness, SKIP_POSTGRES, startBackend } from '../test-support/backends.js';
import { KyselyMembershipRepository } from './membership.repository.kysely.js';

const backends = [
  { backend: 'sqlite' as const, skip: false },
  { backend: 'postgres' as const, skip: SKIP_POSTGRES },
];

for (const { backend, skip } of backends) {
  describe.skipIf(skip)(`KyselyMembershipRepository [${backend}]`, () => {
    let harness: BackendHarness;
    let db: Kysely<AuthDatabase>;
    let repository: KyselyMembershipRepository;

    beforeAll(async () => {
      harness = await startBackend(backend);
      await migrateToLatest({ db: harness.db, backend, rootDir: MIGRATIONS_DIR });
      db = harness.db as unknown as Kysely<AuthDatabase>;
      repository = new KyselyMembershipRepository(db);

      // A valid user (member.userId references user(id); Postgres enforces it).
      await db
        .insertInto('user')
        .values({
          id: 'user-1',
          name: 'Ada',
          email: 'ada@example.com',
          emailVerified: backend === 'postgres' ? true : 1,
          image: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          deletedAt: null,
        })
        .execute();

      // Two workspaces; the user joins the older one first.
      await db
        .insertInto('organization')
        .values([
          {
            id: 'ws-old',
            name: 'Personal',
            slug: 'user-1',
            logo: null,
            metadata: null,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
          {
            id: 'ws-new',
            name: 'Team',
            slug: 'team',
            logo: null,
            metadata: null,
            createdAt: '2026-03-01T00:00:00.000Z',
          },
        ])
        .execute();
      await db
        .insertInto('member')
        .values([
          {
            id: 'm-new',
            organizationId: 'ws-new',
            userId: 'user-1',
            role: 'member',
            createdAt: '2026-03-01T00:00:00.000Z',
          },
          {
            id: 'm-old',
            organizationId: 'ws-old',
            userId: 'user-1',
            role: 'owner',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ])
        .execute();
    }, 120_000);

    afterAll(async () => {
      await harness?.cleanup();
    });

    it('returns the earliest workspace id for a member, regardless of insert order', async () => {
      expect(await repository.findFirstWorkspaceId('user-1')).toBe('ws-old');
    });

    it('returns null for a user with no membership', async () => {
      expect(await repository.findFirstWorkspaceId('nobody')).toBeNull();
    });
  });
}
