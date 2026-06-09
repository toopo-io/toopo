import { describe, expect, it } from 'vitest';
import { createAuthDatabase } from './auth-database.js';

describe('createAuthDatabase', () => {
  it('returns the Better Auth database config, a repository, and a close fn', async () => {
    const handle = createAuthDatabase({ databaseUrl: ':memory:' });

    expect(handle.betterAuthDatabase.type).toBe('sqlite');
    expect(typeof handle.betterAuthDatabase.db.selectFrom).toBe('function');
    expect(typeof handle.userRepository.findUserById).toBe('function');
    expect(typeof handle.userRepository.softDeleteUser).toBe('function');

    await handle.close();
  });
});
