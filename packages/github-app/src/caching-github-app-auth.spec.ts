import { describe, expect, it, vi } from 'vitest';
import { CachingGithubAppAuth, TOKEN_REFRESH_MARGIN_MS } from './caching-github-app-auth';
import type { GithubAppClient } from './github-app-client';
import type { InstallationToken } from './types';

const BASE = new Date('2026-06-10T12:00:00Z').getTime();
const ONE_HOUR_MS = 3_600_000;

/** A controllable clock: `advance` moves "now" forward by ms. */
function fakeClock(): { clock: () => Date; advance: (ms: number) => void } {
  let now = BASE;
  return {
    clock: () => new Date(now),
    advance: (ms) => {
      now += ms;
    },
  };
}

/**
 * A fake client whose `createInstallationToken` returns a token expiring one hour
 * after the supplied `now`, and counts calls per installation. Repo operations are
 * stubbed so the pass-through can be asserted.
 */
function fakeClient(now: () => Date) {
  const mintCalls: number[] = [];
  const client: GithubAppClient = {
    createInstallationToken: vi.fn(async (installationId: number): Promise<InstallationToken> => {
      mintCalls.push(installationId);
      return {
        token: `token-${installationId}-${mintCalls.length}`,
        expiresAt: new Date(now().getTime() + ONE_HOUR_MS),
      };
    }),
    listInstallationRepos: vi.fn(async () => [{ owner: 'acme', name: 'web' }]),
    resolveDefaultBranchHead: vi.fn(async () => ({ defaultBranch: 'main', commitSha: 'sha1' })),
  };
  return { client, mintCalls };
}

describe('CachingGithubAppAuth.mintInstallationToken', () => {
  it('mints on first use and serves the cache while the token is fresh', async () => {
    const { clock, advance } = fakeClock();
    const { client, mintCalls } = fakeClient(clock);
    const auth = new CachingGithubAppAuth(client, clock);

    const first = await auth.mintInstallationToken(1);
    advance(ONE_HOUR_MS - TOKEN_REFRESH_MARGIN_MS - 1_000); // still outside the refresh margin
    const second = await auth.mintInstallationToken(1);

    expect(second).toBe(first);
    expect(mintCalls).toEqual([1]);
  });

  it('re-mints once the token is within the refresh margin of expiry', async () => {
    const { clock, advance } = fakeClock();
    const { client, mintCalls } = fakeClient(clock);
    const auth = new CachingGithubAppAuth(client, clock);

    await auth.mintInstallationToken(1);
    advance(ONE_HOUR_MS - TOKEN_REFRESH_MARGIN_MS); // exactly at the margin (<= re-mints)
    const refreshed = await auth.mintInstallationToken(1);

    expect(mintCalls).toEqual([1, 1]);
    expect(refreshed.token).toBe('token-1-2');
  });

  it('caches per installation independently', async () => {
    const { clock } = fakeClock();
    const { client, mintCalls } = fakeClient(clock);
    const auth = new CachingGithubAppAuth(client, clock);

    await auth.mintInstallationToken(1);
    await auth.mintInstallationToken(2);
    await auth.mintInstallationToken(1);

    expect(mintCalls).toEqual([1, 2]);
  });

  it('defaults to a real clock when none is injected', async () => {
    const { client } = fakeClient(() => new Date());
    const auth = new CachingGithubAppAuth(client);
    const token = await auth.mintInstallationToken(1);
    expect(token.token).toBe('token-1-1');
  });
});

describe('CachingGithubAppAuth pass-throughs', () => {
  it('delegates listInstallationRepos and resolveDefaultBranchHead to the client', async () => {
    const { clock } = fakeClock();
    const { client } = fakeClient(clock);
    const auth = new CachingGithubAppAuth(client, clock);

    expect(await auth.listInstallationRepos(9)).toEqual([{ owner: 'acme', name: 'web' }]);
    expect(await auth.resolveDefaultBranchHead(9, 'acme', 'web')).toEqual({
      defaultBranch: 'main',
      commitSha: 'sha1',
    });
    expect(client.listInstallationRepos).toHaveBeenCalledWith(9);
    expect(client.resolveDefaultBranchHead).toHaveBeenCalledWith(9, 'acme', 'web');
  });
});
