import type { MapView } from '@toopo/api-contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Pin the API base URL without booting the real env validator.
vi.mock('../../../env', () => ({ Env: { NEXT_PUBLIC_API_URL: 'http://api.test' } }));

import { graphApi } from './api';

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

function ok(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}
function fail(status: number, body: unknown): Response {
  return { ok: false, status, json: async () => body } as unknown as Response;
}

const MAP: MapView = {
  level: 'package',
  nodes: [
    { node: { kind: 'package', id: 'pkgA', name: '@toopo/web', properties: {} }, childCount: 2 },
  ],
  edges: [{ sourceId: 'pkgA', targetId: 'pkgB', deterministic: 1, inferred: 0 }],
  truncated: false,
};

afterEach(() => {
  fetchMock.mockReset();
});

describe('graphApi', () => {
  it('builds the map URL against the configured base and parses the response', async () => {
    fetchMock.mockResolvedValue(ok(MAP));
    const result = await graphApi.map({ level: 'package' }, 'en');
    expect(result).toEqual(MAP);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/v1/graph/map?level=package');
    expect((init.headers as Record<string, string>)['Accept-Language']).toBe('en');
  });

  it('encodes a SCIP id into the node query (never a raw path segment)', async () => {
    fetchMock.mockResolvedValue(
      ok({
        node: { kind: 'symbol', id: 'a/b#', name: 'X', properties: {} },
        declaredInterface: { items: [], nextCursor: null },
        incoming: { items: [], nextCursor: null },
        outgoing: { items: [], nextCursor: null },
        callSites: { items: [], nextCursor: null },
      }),
    );
    await graphApi.node({ id: 'a/b#' });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('http://api.test/v1/graph/node?id=a%2Fb%23');
  });

  it('throws the decoded error-envelope message on a non-ok response', async () => {
    fetchMock.mockResolvedValue(fail(404, { code: 'NOT_FOUND', message: 'Node not found' }));
    await expect(graphApi.node({ id: 'ghost' })).rejects.toThrow('Node not found');
  });

  it('rejects a response that violates the contract schema (untrusted data)', async () => {
    fetchMock.mockResolvedValue(
      ok({ level: 'package', nodes: 'not-an-array', edges: [], truncated: false }),
    );
    await expect(graphApi.map({ level: 'package' })).rejects.toBeInstanceOf(Error);
  });
});
