import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR } from '../migrations-dir.js';
import { migrateToLatest } from '../migrator.js';
import type { AuthDatabase } from '../schema/auth-types.js';
import { type BackendHarness, SKIP_POSTGRES, startBackend } from '../test-support/backends.js';
import { KyselyUserRepository } from './user.repository.kysely.js';

const ACTIVE = 'u-active';
const DELETED = 'u-deleted';
const SOFTDEL = 'u-softdel';

async function seedUser(
  db: Kysely<AuthDatabase>,
  id: string,
  deletedAt: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .insertInto('user')
    .values({
      id,
      name: `User ${id}`,
      email: `${id}@example.com`,
      emailVerified: true,
      image: null,
      createdAt: now,
      updatedAt: now,
      deletedAt,
    })
    .execute();
}

async function seedSession(db: Kysely<AuthDatabase>, id: string, userId: string): Promise<void> {
  const now = new Date().toISOString();
  await db
    .insertInto('session')
    .values({
      id,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      token: `token-${id}`,
      createdAt: now,
      updatedAt: now,
      ipAddress: '127.0.0.1',
      userAgent: 'vitest',
      userId,
    })
    .execute();
}

async function seedAccount(db: Kysely<AuthDatabase>, id: string, userId: string): Promise<void> {
  const now = new Date().toISOString();
  await db
    .insertInto('account')
    .values({
      id,
      accountId: `acc-${id}`,
      providerId: 'credential',
      userId,
      accessToken: 'secret-access-token',
      refreshToken: null,
      idToken: null,
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
      scope: null,
      password: 'secret-hash',
      createdAt: now,
      updatedAt: now,
    })
    .execute();
}

const backends = [
  { backend: 'sqlite' as const, skip: false },
  { backend: 'postgres' as const, skip: SKIP_POSTGRES },
];

for (const { backend, skip } of backends) {
  describe.skipIf(skip)(`KyselyUserRepository [${backend}]`, () => {
    let harness: BackendHarness;
    let repo: KyselyUserRepository;
    let db: Kysely<AuthDatabase>;

    beforeAll(async () => {
      harness = await startBackend(backend);
      db = harness.db as unknown as Kysely<AuthDatabase>;
      await migrateToLatest({ db: harness.db, backend, rootDir: MIGRATIONS_DIR });
      await seedUser(db, ACTIVE, null);
      await seedUser(db, DELETED, new Date('2026-01-01T00:00:00.000Z').toISOString());
      await seedUser(db, SOFTDEL, null);
      await seedSession(db, 's-active', ACTIVE);
      await seedSession(db, 's-softdel-1', SOFTDEL);
      await seedSession(db, 's-softdel-2', SOFTDEL);
      await seedAccount(db, 'a-active', ACTIVE);
      repo = new KyselyUserRepository(db);
    }, 120_000);

    afterAll(async () => {
      await harness?.cleanup();
    });

    it('findDeletedAt distinguishes active / deleted / missing', async () => {
      expect(await repo.findDeletedAt(ACTIVE)).toBeNull();
      const deletedAt = await repo.findDeletedAt(DELETED);
      expect(deletedAt).toBeInstanceOf(Date);
      expect(await repo.findDeletedAt('nope')).toBeUndefined();
    });

    it('isActive is true only for an existing, non-deleted user', async () => {
      expect(await repo.isActive(ACTIVE)).toBe(true);
      expect(await repo.isActive(DELETED)).toBe(false);
      expect(await repo.isActive('nope')).toBe(false);
    });

    it('findUserById normalizes types and omits deletedAt', async () => {
      const user = await repo.findUserById(ACTIVE);
      expect(user).not.toBeNull();
      expect(user?.email).toBe(`${ACTIVE}@example.com`);
      expect(user?.emailVerified).toBe(true); // boolean (pg) / 0|1 (sqlite) coerced
      expect(user?.createdAt).toBeInstanceOf(Date);
      expect(user).not.toHaveProperty('deletedAt');
      expect(await repo.findUserById('nope')).toBeNull();
    });

    it('listSessions returns normalized records without token bytes', async () => {
      const sessions = await repo.listSessions(ACTIVE);
      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.expiresAt).toBeInstanceOf(Date);
      expect(sessions[0]).not.toHaveProperty('token');
    });

    it('listAccounts returns normalized records without credentials', async () => {
      const accounts = await repo.listAccounts(ACTIVE);
      expect(accounts).toHaveLength(1);
      expect(accounts[0]?.providerId).toBe('credential');
      expect(accounts[0]).not.toHaveProperty('password');
      expect(accounts[0]).not.toHaveProperty('accessToken');
    });

    it('softDeleteUser sets deletedAt and revokes sessions in one transaction', async () => {
      expect(await repo.listSessions(SOFTDEL)).toHaveLength(2);

      const { deletedAt } = await repo.softDeleteUser(SOFTDEL);
      expect(deletedAt).toBeInstanceOf(Date);

      expect(await repo.findDeletedAt(SOFTDEL)).toBeInstanceOf(Date);
      expect(await repo.isActive(SOFTDEL)).toBe(false);
      expect(await repo.listSessions(SOFTDEL)).toHaveLength(0);
    });
  });
}
