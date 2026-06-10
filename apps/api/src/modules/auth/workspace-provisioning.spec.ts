/**
 * Unit tests for the lazy personal-workspace provisioning policy (ADR-0028,
 * Phase 1b). Pure: all dependencies are fakes, so we assert the fail-soft and
 * race-recovery contract without Better Auth or a database.
 */
import { describe, expect, it, vi } from 'vitest';
import { createEnsureActiveWorkspace } from './workspace-provisioning';

function silentLogger() {
  return { error: vi.fn() };
}

describe('createEnsureActiveWorkspace', () => {
  it('returns the existing workspace without creating one', async () => {
    const createPersonalWorkspace = vi.fn();
    const ensure = createEnsureActiveWorkspace({
      findFirstWorkspaceId: async () => 'ws-existing',
      createPersonalWorkspace,
      logger: silentLogger(),
    });

    expect(await ensure('user-1')).toBe('ws-existing');
    expect(createPersonalWorkspace).not.toHaveBeenCalled();
  });

  it('creates the personal workspace when the user has none', async () => {
    const ensure = createEnsureActiveWorkspace({
      findFirstWorkspaceId: async () => null,
      createPersonalWorkspace: async () => 'ws-created',
      logger: silentLogger(),
    });

    expect(await ensure('user-1')).toBe('ws-created');
  });

  it('recovers from the creation race by re-reading, without logging an error', async () => {
    const logger = silentLogger();
    // First read sees nothing; creation collides on the unique slug; the
    // re-read now finds the workspace the concurrent session created.
    const findFirstWorkspaceId = vi
      .fn<(userId: string) => Promise<string | null>>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('ws-raced');
    const ensure = createEnsureActiveWorkspace({
      findFirstWorkspaceId,
      createPersonalWorkspace: async () => {
        throw new Error('UNIQUE constraint failed: organization.slug');
      },
      logger,
    });

    expect(await ensure('user-1')).toBe('ws-raced');
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('is fail-soft: returns null and logs when creation fails with no recovery', async () => {
    const logger = silentLogger();
    const ensure = createEnsureActiveWorkspace({
      findFirstWorkspaceId: async () => null,
      createPersonalWorkspace: async () => {
        throw new Error('database unavailable');
      },
      logger,
    });

    expect(await ensure('user-1')).toBeNull();
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it('never throws even when the initial read fails', async () => {
    const logger = silentLogger();
    const ensure = createEnsureActiveWorkspace({
      findFirstWorkspaceId: vi
        .fn<(userId: string) => Promise<string | null>>()
        .mockRejectedValueOnce(new Error('read failed'))
        .mockResolvedValueOnce(null),
      createPersonalWorkspace: async () => 'unused',
      logger,
    });

    expect(await ensure('user-1')).toBeNull();
    expect(logger.error).toHaveBeenCalledOnce();
  });
});
