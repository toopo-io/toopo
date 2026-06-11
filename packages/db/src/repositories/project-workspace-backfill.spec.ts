/**
 * The Phase 2 workspace backfill (`0010_project_workspace.sql`, ADR-0028) on both
 * backends. The migration runner only ever applies a migration once, so to
 * exercise the backfill against REAL pre-existing data we stage it: migrate to
 * 0009 (project without workspace_id), seed legacy users/workspaces/projects,
 * then apply 0010 and assert each of the three attribution tiers.
 *
 *   Tier 1 — owner already has a membership: take the earliest (the exact rule
 *            MembershipRepository.findFirstWorkspaceId uses, so a project and its
 *            owner's session converge on one workspace).
 *   Tier 2 — owner exists but has no membership: synthesize the personal
 *            workspace AT REST, byte-for-byte the shape Phase 1b creates at
 *            runtime. The parity assertions pin the SQL to the documented
 *            convention, and a findFirstWorkspaceId read proves a later first
 *            sign-in is a clean no-op (no duplicate).
 *   Tier 3 — unattributable owner (no user row): the members-less sentinel.
 *
 * Plus: every project ends up NOT NULL, and a second migrateToLatest is a no-op
 * (no duplicate synthesized rows).
 */
import { type Kysely, sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR } from '../migrations-dir.js';
import { migrateTo, migrateToLatest } from '../migrator.js';
import type { AuthDatabase } from '../schema/auth-types.js';
import {
  ORPHANED_WORKSPACE_NAME,
  ORPHANED_WORKSPACE_SLUG,
  PERSONAL_WORKSPACE_NAME,
  PERSONAL_WORKSPACE_OWNER_ROLE,
  personalWorkspaceSlug,
} from '../schema/personal-workspace.js';
import { type BackendHarness, SKIP_POSTGRES, startBackend } from '../test-support/backends.js';
import { KyselyMembershipRepository } from './membership.repository.kysely.js';

const HAS_MEMBER = 'u-has-member';
const SOLO = 'u-solo';
const GHOST = 'u-ghost'; // owner_user_id with NO user row — unattributable.
const EARLY_WS = 'ws-early';
const LATE_WS = 'ws-late';

interface ProjectRow {
  readonly id: string;
  readonly owner_user_id: string;
  readonly workspace_id: string;
}
interface OrgRow {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
}
interface MemberRow {
  readonly organizationId: string;
  readonly userId: string;
  readonly role: string;
}

const backends = [
  { backend: 'sqlite' as const, skip: false },
  { backend: 'postgres' as const, skip: SKIP_POSTGRES },
];

for (const { backend, skip } of backends) {
  describe.skipIf(skip)(`0010 project workspace backfill [${backend}]`, () => {
    let harness: BackendHarness;
    let db: Kysely<unknown>;

    beforeAll(async () => {
      harness = await startBackend(backend);
      db = harness.db;

      // 1) Migrate to the migration BEFORE the one under test.
      await migrateTo({ db, backend, rootDir: MIGRATIONS_DIR }, '0009_unresolved_reference');

      // 2) Seed legacy data through raw SQL (the project table has no workspace_id
      //    yet, so a typed insert would not compile). Two real users; a third
      //    owner id ('u-ghost') deliberately has no user row.
      const verified = backend === 'postgres' ? true : 1;
      await sql`
        insert into "user" ("id", "name", "email", "emailVerified", "image", "createdAt", "updatedAt", "deletedAt")
        values
          (${HAS_MEMBER}, 'Has', 'has@example.com', ${verified}, null, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', null),
          (${SOLO}, 'Solo', 'solo@example.com', ${verified}, null, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', null)
      `.execute(db);

      // The has-member user belongs to two workspaces; the older one must win.
      await sql`
        insert into "organization" ("id", "name", "slug", "logo", "createdAt", "metadata")
        values
          (${EARLY_WS}, 'Early', 'early', null, '2026-01-01T00:00:00.000Z', null),
          (${LATE_WS}, 'Late', 'late', null, '2026-03-01T00:00:00.000Z', null)
      `.execute(db);
      await sql`
        insert into "member" ("id", "organizationId", "userId", "role", "createdAt")
        values
          ('m-late', ${LATE_WS}, ${HAS_MEMBER}, 'member', '2026-03-01T00:00:00.000Z'),
          ('m-early', ${EARLY_WS}, ${HAS_MEMBER}, 'owner', '2026-01-01T00:00:00.000Z')
      `.execute(db);

      // One project per owner population.
      await sql`
        insert into "project" ("id", "owner_user_id", "repo_host", "repo_owner", "repo_name", "installation_id", "archived_at", "created_at", "updated_at")
        values
          ('proj-has', ${HAS_MEMBER}, 'github', 'acme', 'has', null, null, '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z'),
          ('proj-solo', ${SOLO}, 'github', 'acme', 'solo', null, null, '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z'),
          ('proj-ghost', ${GHOST}, 'github', 'acme', 'ghost', null, null, '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z')
      `.execute(db);

      // 3) Apply 0010 — the backfill under test.
      await migrateToLatest({ db, backend, rootDir: MIGRATIONS_DIR });
    }, 120_000);

    afterAll(async () => {
      await harness?.cleanup();
    });

    async function project(id: string): Promise<ProjectRow> {
      const { rows } = await sql<ProjectRow>`
        select "id", "owner_user_id", "workspace_id" from "project" where "id" = ${id}
      `.execute(db);
      return rows[0] as ProjectRow;
    }
    async function orgBySlug(slug: string): Promise<OrgRow | undefined> {
      const { rows } = await sql<OrgRow>`
        select "id", "name", "slug" from "organization" where "slug" = ${slug}
      `.execute(db);
      return rows[0];
    }

    it('Tier 1 — backfills the owner earliest existing workspace', async () => {
      expect((await project('proj-has')).workspace_id).toBe(EARLY_WS);
    });

    it('Tier 2 — synthesizes the personal workspace matching the Phase 1b convention', async () => {
      const personal = await orgBySlug(personalWorkspaceSlug(SOLO));
      expect(personal).toBeDefined();
      expect(personal?.name).toBe(PERSONAL_WORKSPACE_NAME);

      const { rows: members } = await sql<MemberRow>`
        select "organizationId", "userId", "role" from "member" where "organizationId" = ${personal?.id ?? ''}
      `.execute(db);
      expect(members).toHaveLength(1);
      expect(members[0]?.userId).toBe(SOLO);
      expect(members[0]?.role).toBe(PERSONAL_WORKSPACE_OWNER_ROLE);

      expect((await project('proj-solo')).workspace_id).toBe(personal?.id);
    });

    it('Tier 2 — converges: findFirstWorkspaceId resolves it (no-op sign-in) and the owner is a member (Phase 3 → 200)', async () => {
      const memberships = new KyselyMembershipRepository(db as unknown as Kysely<AuthDatabase>);
      const personal = await orgBySlug(personalWorkspaceSlug(SOLO));
      expect(await memberships.findFirstWorkspaceId(SOLO)).toBe(personal?.id);
      // The backfilled legacy project's owner IS a member of its synthesized
      // workspace, so Phase 3's isMember check grants access (200), not 403.
      expect(await memberships.isMember(SOLO, personal?.id ?? '')).toBe(true);
    });

    it('Tier 3 — routes an unattributable project to the members-less sentinel', async () => {
      const sentinel = await orgBySlug(ORPHANED_WORKSPACE_SLUG);
      expect(sentinel).toBeDefined();
      expect(sentinel?.name).toBe(ORPHANED_WORKSPACE_NAME);
      expect((await project('proj-ghost')).workspace_id).toBe(sentinel?.id);

      const { rows: members } = await sql<MemberRow>`
        select "organizationId", "userId", "role" from "member" where "organizationId" = ${sentinel?.id ?? ''}
      `.execute(db);
      expect(members).toEqual([]);
    });

    it('leaves no project without a workspace', async () => {
      const { rows } = await sql<{ n: number }>`
        select count(*) as n from "project" where "workspace_id" is null
      `.execute(db);
      expect(Number(rows[0]?.n)).toBe(0);
    });

    it('is idempotent — re-running migrations applies nothing and duplicates no synthesized row', async () => {
      const applied = await migrateToLatest({ db, backend, rootDir: MIGRATIONS_DIR });
      expect(applied).toEqual([]);

      const { rows } = await sql<{ n: number }>`
        select count(*) as n from "organization" where "slug" in (${personalWorkspaceSlug(SOLO)}, ${ORPHANED_WORKSPACE_SLUG})
      `.execute(db);
      expect(Number(rows[0]?.n)).toBe(2);
    });
  });
}
