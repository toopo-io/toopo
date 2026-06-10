import type { CompleteInstallResponse, InstallUrlResponse } from '@toopo/api-contracts';
import { describe, expect, it, vi } from 'vitest';
import type { CurrentSessionData } from '../user/session.guard';
import { GithubConnectController } from './github-connect.controller';
import type { GithubInstallService } from './github-install.service';

const session = {
  user: { id: 'user-1', email: 'u@e.com', name: 'U', emailVerified: true },
  session: { id: 's1', userId: 'user-1' },
} satisfies CurrentSessionData;

describe('GithubConnectController', () => {
  it('initiate delegates to the service with the session user id', () => {
    const url: InstallUrlResponse = { url: 'https://github.com/apps/x/installations/new?state=s' };
    const install = { buildInstallUrl: vi.fn(() => url) } as unknown as GithubInstallService;
    const controller = new GithubConnectController(install);

    expect(controller.initiate(session)).toBe(url);
    expect(install.buildInstallUrl).toHaveBeenCalledWith('user-1');
  });

  it('complete forwards the body and session user id to the service', async () => {
    const response: CompleteInstallResponse = { linked: true, projectsConnected: 2 };
    const install = {
      completeInstall: vi.fn(async () => response),
    } as unknown as GithubInstallService;
    const controller = new GithubConnectController(install);

    const result = await controller.complete(
      { installationId: '55', setupAction: 'install', state: 'tok' },
      session,
    );

    expect(result).toBe(response);
    expect(install.completeInstall).toHaveBeenCalledWith({
      installationId: '55',
      setupAction: 'install',
      state: 'tok',
      sessionUserId: 'user-1',
    });
  });
});
