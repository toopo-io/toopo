import { afterEach, describe, expect, it, vi } from 'vitest';

// Pin the API base URL without booting the real env validator.
vi.mock('../../../env', () => ({ Env: { NEXT_PUBLIC_API_URL: 'http://api.test' } }));

import { completeInstall, getInstallUrl } from './api';

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

function ok(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

afterEach(() => {
  fetchMock.mockReset();
});

describe('github connect api', () => {
  it('getInstallUrl GETs the install path and parses the URL', async () => {
    fetchMock.mockResolvedValue(ok({ url: 'https://github.com/apps/x/installations/new?state=s' }));
    const result = await getInstallUrl('en');
    expect(result.url).toBe('https://github.com/apps/x/installations/new?state=s');
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/v1/github/install');
  });

  it('completeInstall POSTs the body and parses the result', async () => {
    fetchMock.mockResolvedValue(ok({ linked: true, projectsConnected: 3 }));
    const result = await completeInstall(
      { installationId: '55', setupAction: 'install', state: 'tok' },
      'en',
    );
    expect(result).toEqual({ linked: true, projectsConnected: 3 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/v1/github/install/complete');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      installationId: '55',
      setupAction: 'install',
      state: 'tok',
    });
  });

  it('rejects an unexpected install-url response shape (Zod boundary)', async () => {
    fetchMock.mockResolvedValue(ok({ notUrl: 1 }));
    await expect(getInstallUrl('en')).rejects.toThrow();
  });
});
