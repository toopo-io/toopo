import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { UserRepository } from '@toopo/db';
import { USER_REPOSITORY } from '../database/database.module';

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
  constructor(@Inject(USER_REPOSITORY) private readonly users: UserRepository) {}

  async exportUserData(userId: string): Promise<UserDataExport> {
    const user = await this.users.findUserById(userId);
    if (user === null) {
      throw new NotFoundException('User not found');
    }
    const [sessions, accounts] = await Promise.all([
      this.users.listSessions(userId),
      this.users.listAccounts(userId),
    ]);

    return {
      exportedAt: new Date().toISOString(),
      user,
      sessions: sessions.map((session) => ({
        id: session.id,
        expiresAt: session.expiresAt,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
      })),
      accounts: accounts.map((account) => ({
        id: account.id,
        providerId: account.providerId,
        accountId: account.accountId,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
      })),
    };
  }

  async softDeleteUser(userId: string): Promise<{ deletedAt: Date }> {
    return this.users.softDeleteUser(userId);
  }

  // Returns false if the user is missing or soft-deleted. Used as a
  // defense-in-depth check by `SessionGuard` and by `dataExport` even
  // though `auth.soft-delete-guard.ts` already blocks new sessions for
  // soft-deleted users at the Better Auth hook layer. See B10.
  async isActive(userId: string): Promise<boolean> {
    return this.users.isActive(userId);
  }
}
