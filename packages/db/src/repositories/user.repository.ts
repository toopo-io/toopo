/**
 * The persistence abstraction apps/api depends on (ADR-0017 §1 repository
 * pattern). It owns ONLY our custom reads and the RGPD soft-delete transaction;
 * Better Auth owns every canonical-table write performed during auth flows.
 * apps/api imports this interface, never Kysely directly, so the storage engine
 * stays swappable behind it.
 */
import type { AccountRecord, SessionRecord, UserRecord } from './user-records.js';

export interface UserRepository {
  /**
   * The soft-delete timestamp for the auth session guard (ADR-0013):
   *   - `undefined` when no such user exists,
   *   - `null` when the user is active,
   *   - a `Date` when the user is soft-deleted.
   */
  findDeletedAt(userId: string): Promise<Date | null | undefined>;

  /** True only when the user exists and is not soft-deleted (defense-in-depth). */
  isActive(userId: string): Promise<boolean>;

  /** The user record for the RGPD export, or `null` when absent. */
  findUserById(userId: string): Promise<UserRecord | null>;

  listSessions(userId: string): Promise<readonly SessionRecord[]>;
  listAccounts(userId: string): Promise<readonly AccountRecord[]>;

  /**
   * RGPD Article 17 erasure: set `deletedAt` and revoke all sessions in one
   * transaction. Returns the applied timestamp.
   */
  softDeleteUser(userId: string): Promise<{ readonly deletedAt: Date }>;
}
