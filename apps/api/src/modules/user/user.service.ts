import { Injectable, NotFoundException } from '@nestjs/common';
import { createDb, type Db } from '@toopo/db';
import { account, session, user } from '@toopo/db/schema';
import { eq } from 'drizzle-orm';
import { Env } from '../../env';

export interface UserDataExport {
  readonly exportedAt: string;
  readonly user: {
    readonly id: string;
    readonly name: string;
    readonly email: string;
    readonly emailVerified: boolean;
    readonly image: string | null;
    readonly createdAt: Date;
    readonly updatedAt: Date;
  };
  readonly sessions: ReadonlyArray<{
    readonly id: string;
    readonly expiresAt: Date;
    readonly createdAt: Date;
    readonly updatedAt: Date;
    readonly ipAddress: string | null;
    readonly userAgent: string | null;
  }>;
  readonly accounts: ReadonlyArray<{
    readonly id: string;
    readonly providerId: string;
    readonly accountId: string;
    readonly createdAt: Date;
    readonly updatedAt: Date;
  }>;
}

@Injectable()
export class UserService {
  private readonly db: Db;

  constructor() {
    this.db = createDb({ databaseUrl: Env.DATABASE_URL });
  }

  async exportUserData(userId: string): Promise<UserDataExport> {
    const userRows = await this.db.select().from(user).where(eq(user.id, userId)).limit(1);
    const userRow = userRows[0];
    if (userRow === undefined) {
      throw new NotFoundException('User not found');
    }
    const sessions = await this.db.select().from(session).where(eq(session.userId, userId));
    const accounts = await this.db.select().from(account).where(eq(account.userId, userId));

    return {
      exportedAt: new Date().toISOString(),
      user: {
        id: userRow.id,
        name: userRow.name,
        email: userRow.email,
        emailVerified: userRow.emailVerified,
        image: userRow.image,
        createdAt: userRow.createdAt,
        updatedAt: userRow.updatedAt,
      },
      sessions: sessions.map((row) => ({
        id: row.id,
        expiresAt: row.expiresAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        ipAddress: row.ipAddress,
        userAgent: row.userAgent,
      })),
      accounts: accounts.map((row) => ({
        id: row.id,
        providerId: row.providerId,
        accountId: row.accountId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
    };
  }

  async softDeleteUser(userId: string): Promise<{ deletedAt: Date }> {
    const deletedAt = new Date();
    await this.db.transaction(async (tx) => {
      await tx.update(user).set({ deletedAt }).where(eq(user.id, userId));
      await tx.delete(session).where(eq(session.userId, userId));
    });
    return { deletedAt };
  }

  // Returns false if the user is missing or soft-deleted. Used as a
  // defense-in-depth check by `SessionGuard` and by `dataExport` even
  // though `auth.soft-delete-guard.ts` already blocks new sessions for
  // soft-deleted users at the Better Auth hook layer. See B10.
  async isActive(userId: string): Promise<boolean> {
    const rows = await this.db
      .select({ deletedAt: user.deletedAt })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    return rows[0] !== undefined && rows[0].deletedAt === null;
  }
}
