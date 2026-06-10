import type { ProjectRecord } from '@toopo/db';
import { describe, expect, it } from 'vitest';
import type { CurrentSessionData } from '../user/session.guard';
import { canAccessProject } from './project-access';

const project: ProjectRecord = {
  id: 'p1',
  ownerUserId: 'owner',
  repoHost: 'github',
  repoOwner: 'acme',
  repoName: 'web',
  installationId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function sessionFor(userId: string): CurrentSessionData {
  return {
    user: { id: userId, email: 'a@b.c', name: 'A', emailVerified: true },
    session: { id: 's1', userId },
  };
}

describe('canAccessProject (OSS instance-tenant line, ADR-0022 §2)', () => {
  it('allows any authenticated user of the instance — even a non-owner', () => {
    expect(canAccessProject(sessionFor('owner'), project)).toBe(true);
    expect(canAccessProject(sessionFor('someone-else'), project)).toBe(true);
  });
});
