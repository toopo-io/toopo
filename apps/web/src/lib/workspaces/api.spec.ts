import { afterEach, describe, expect, it, vi } from 'vitest';
import { listMyWorkspaces } from './api';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('listMyWorkspaces', () => {
  it('returns the validated workspaces the caller belongs to', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify([
          { id: 'ws_1', name: 'Acme Labs', slug: 'acme', logo: null, role: 'owner' },
        ]),
        { status: 200 },
      ),
    );
    await expect(listMyWorkspaces()).resolves.toEqual([
      { id: 'ws_1', name: 'Acme Labs', slug: 'acme', logo: null },
    ]);
  });

  it('degrades to an empty list when the read fails (display chrome, not a gate)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 500 }));
    await expect(listMyWorkspaces()).resolves.toEqual([]);
  });

  it('degrades to an empty list when the response is malformed', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([{ slug: 'x' }]), { status: 200 }),
    );
    await expect(listMyWorkspaces()).resolves.toEqual([]);
  });
});
