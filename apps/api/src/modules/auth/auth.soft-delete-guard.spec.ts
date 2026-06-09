import { describe, expect, it, vi } from 'vitest';
import { createSessionCreateBeforeHook } from './auth.soft-delete-guard';

describe('createSessionCreateBeforeHook', () => {
  function makeDeps(deletedAt: Date | null | undefined) {
    const warn = vi.fn();
    const getUserDeletedAt = vi.fn().mockResolvedValue(deletedAt);
    const hook = createSessionCreateBeforeHook({
      logger: { warn },
      getUserDeletedAt,
    });
    return { hook, warn, getUserDeletedAt };
  }

  it('allows session creation when the user has no deleted_at', async () => {
    const { hook, warn, getUserDeletedAt } = makeDeps(null);
    await expect(hook({ userId: 'u-active' })).resolves.toBeUndefined();
    expect(getUserDeletedAt).toHaveBeenCalledWith('u-active');
    expect(warn).not.toHaveBeenCalled();
  });

  it('allows session creation when the user lookup returns undefined (missing row)', async () => {
    const { hook, warn } = makeDeps(undefined);
    await expect(hook({ userId: 'u-missing' })).resolves.toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it('throws an APIError matching the wrong-password shape when the user is soft-deleted', async () => {
    const { hook, warn } = makeDeps(new Date('2026-05-16T08:24:20.019Z'));
    await expect(hook({ userId: 'u-deleted' })).rejects.toMatchObject({
      status: 'UNAUTHORIZED',
      body: {
        code: 'INVALID_EMAIL_OR_PASSWORD',
        message: 'Invalid email or password',
      },
    });
    expect(warn).toHaveBeenCalledWith(
      { event: 'auth.signin.soft_deleted_blocked', userId: 'u-deleted' },
      'auth: blocked session create for soft-deleted user',
    );
  });

  it('does not invoke the logger for active users (no noise)', async () => {
    const { hook, warn } = makeDeps(null);
    await hook({ userId: 'u-active-2' });
    expect(warn).toHaveBeenCalledTimes(0);
  });
});
