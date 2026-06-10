import { describe, expect, it } from 'vitest';
import { createGithubAppClient, type OctokitFactory, type OctokitLike } from './github-app-client';

interface RequestRecord {
  readonly scope: 'app' | `installation:${number}`;
  readonly route: string;
  readonly params: Record<string, unknown> | undefined;
}

type Handler = (route: string, params: Record<string, unknown> | undefined) => unknown;

/** A recording fake factory: every request is logged, the handler supplies `data`. */
function fakeFactory(handler: Handler): { factory: OctokitFactory; calls: RequestRecord[] } {
  const calls: RequestRecord[] = [];
  const client = (scope: RequestRecord['scope']): OctokitLike => ({
    request: async (route, params) => {
      calls.push({ scope, route, params });
      return { data: handler(route, params) };
    },
  });
  return {
    calls,
    factory: {
      app: () => client('app'),
      forInstallation: (installationId) => client(`installation:${installationId}`),
    },
  };
}

describe('createGithubAppClient.createInstallationToken', () => {
  it('requests an installation token as the App and maps expires_at to a Date', async () => {
    const { factory, calls } = fakeFactory(() => ({
      token: 'ghs_secret',
      expires_at: '2026-06-10T12:00:00Z',
    }));
    const client = createGithubAppClient(factory);

    const token = await client.createInstallationToken(42);

    expect(token).toEqual({ token: 'ghs_secret', expiresAt: new Date('2026-06-10T12:00:00Z') });
    expect(calls).toEqual([
      {
        scope: 'app',
        route: 'POST /app/installations/{installation_id}/access_tokens',
        params: { installation_id: 42 },
      },
    ]);
  });

  it('rejects a token response missing the token field (untrusted input, ADR-0006)', async () => {
    const client = createGithubAppClient(
      fakeFactory(() => ({ expires_at: '2026-06-10T12:00:00Z' })).factory,
    );
    await expect(client.createInstallationToken(42)).rejects.toThrow();
  });
});

describe('createGithubAppClient.listInstallationRepos', () => {
  it('maps owner.login + name and queries as the installation', async () => {
    const { factory, calls } = fakeFactory(() => ({
      repositories: [
        { name: 'web', owner: { login: 'acme' } },
        { name: 'api', owner: { login: 'acme' } },
      ],
    }));
    const repos = await createGithubAppClient(factory).listInstallationRepos(7);

    expect(repos).toEqual([
      { owner: 'acme', name: 'web' },
      { owner: 'acme', name: 'api' },
    ]);
    expect(calls).toEqual([
      {
        scope: 'installation:7',
        route: 'GET /installation/repositories',
        params: { per_page: 100, page: 1 },
      },
    ]);
  });

  it('returns an empty list with a single request', async () => {
    const { factory, calls } = fakeFactory(() => ({ repositories: [] }));
    const repos = await createGithubAppClient(factory).listInstallationRepos(7);
    expect(repos).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it('paginates until a short page (a full page implies there may be more)', async () => {
    const fullPage = Array.from({ length: 100 }, (_, i) => ({
      name: `repo-${i}`,
      owner: { login: 'acme' },
    }));
    const handler: Handler = (_route, params) => {
      const page = (params as { page: number }).page;
      return page === 1
        ? { repositories: fullPage }
        : { repositories: [{ name: 'last', owner: { login: 'acme' } }] };
    };
    const { factory, calls } = fakeFactory(handler);

    const repos = await createGithubAppClient(factory).listInstallationRepos(7);

    expect(repos).toHaveLength(101);
    expect(repos.at(-1)).toEqual({ owner: 'acme', name: 'last' });
    expect(calls.map((c) => (c.params as { page: number }).page)).toEqual([1, 2]);
  });
});

describe('createGithubAppClient.resolveDefaultBranchHead', () => {
  it('reads the default branch then its HEAD sha, both as the installation', async () => {
    const handler: Handler = (route) => {
      if (route === 'GET /repos/{owner}/{repo}') {
        return { default_branch: 'main' };
      }
      return { commit: { sha: 'abc123' } };
    };
    const { factory, calls } = fakeFactory(handler);

    const head = await createGithubAppClient(factory).resolveDefaultBranchHead(7, 'acme', 'web');

    expect(head).toEqual({ defaultBranch: 'main', commitSha: 'abc123' });
    expect(calls).toEqual([
      {
        scope: 'installation:7',
        route: 'GET /repos/{owner}/{repo}',
        params: { owner: 'acme', repo: 'web' },
      },
      {
        scope: 'installation:7',
        route: 'GET /repos/{owner}/{repo}/branches/{branch}',
        params: { owner: 'acme', repo: 'web', branch: 'main' },
      },
    ]);
  });

  it('rejects a branch response missing the commit sha', async () => {
    const handler: Handler = (route) =>
      route === 'GET /repos/{owner}/{repo}' ? { default_branch: 'main' } : { commit: {} };
    await expect(
      createGithubAppClient(fakeFactory(handler).factory).resolveDefaultBranchHead(
        7,
        'acme',
        'web',
      ),
    ).rejects.toThrow();
  });
});
