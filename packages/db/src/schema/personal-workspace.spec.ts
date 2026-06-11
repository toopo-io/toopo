/**
 * Personal-workspace convention — the single source of truth for the deterministic
 * slug that the runtime (Phase 1b) and the at-rest backfill (Phase 2) MUST agree
 * on. A direct format assertion pins the slug shape (`user-<id>`); the backfill
 * spec separately pins the migration SQL to this same module, so drift between the
 * two languages is caught on both sides (ADR-0028).
 */
import { describe, expect, it } from 'vitest';
import { personalWorkspaceSlug } from './personal-workspace.js';

describe('personalWorkspaceSlug', () => {
  it('is exactly the `user-<id>` prefix form, byte-for-byte', () => {
    expect(personalWorkspaceSlug('abc')).toBe('user-abc');
    expect(personalWorkspaceSlug('123e4567-e89b-12d3-a456-426614174000')).toBe(
      'user-123e4567-e89b-12d3-a456-426614174000',
    );
  });

  it('is deterministic and unique per user id', () => {
    const id = 'user-7';
    expect(personalWorkspaceSlug(id)).toBe(`user-${id}`);
    expect(personalWorkspaceSlug('a')).not.toBe(personalWorkspaceSlug('b'));
  });
});
