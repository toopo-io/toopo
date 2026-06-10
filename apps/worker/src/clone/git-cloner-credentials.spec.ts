/**
 * The headline security proof for B5.5 (ADR-0026 §5): the installation token NEVER
 * appears in any `git` argv, the remote URL, or a ref — it lives only in the
 * GIT_ASKPASS credential env of the git child. `spawn` is mocked to capture every
 * invocation's argv + env so the confinement is asserted directly, not assumed.
 */
import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { spawnCalls } = vi.hoisted(() => ({
  spawnCalls: [] as Array<{ args: string[]; env: NodeJS.ProcessEnv }>,
}));

vi.mock('node:child_process', () => ({
  spawn: vi.fn((_cmd: string, args: string[], opts: { env: NodeJS.ProcessEnv }) => {
    spawnCalls.push({ args, env: opts.env });
    const child = new EventEmitter() as EventEmitter & { stderr: EventEmitter };
    child.stderr = new EventEmitter();
    queueMicrotask(() => child.emit('close', 0, null));
    return child;
  }),
}));

import { ASKPASS_PASSWORD_ENV, ASKPASS_USERNAME_ENV } from './git-askpass';
import { GitCloner } from './git-cloner';

const TOKEN = 'ghs_topsecret_installation_token';
const TOKENLESS_URL = 'https://github.com/acme/private.git';

beforeEach(() => {
  spawnCalls.length = 0;
});

describe('GitCloner private clone — credential confinement', () => {
  it('feeds the token via GIT_ASKPASS env only, never the URL, argv, or refs', async () => {
    const cloner = new GitCloner({ remoteUrl: () => TOKENLESS_URL });
    await cloner.clone({
      repo: { host: 'github.com', owner: 'acme', name: 'private' },
      commitSha: 'a'.repeat(40),
      destination: 'unused-spawn-is-mocked',
      credentials: { username: 'x-access-token', password: TOKEN },
    });

    expect(spawnCalls).toHaveLength(4); // init, remote add, fetch, checkout
    const allArgs = spawnCalls.flatMap((call) => call.args);
    expect(allArgs.some((arg) => arg.includes(TOKEN))).toBe(false);
    expect(allArgs).toContain(TOKENLESS_URL);
    for (const call of spawnCalls) {
      expect(call.env['GIT_ASKPASS']).toBeTruthy();
      expect(call.env[ASKPASS_USERNAME_ENV]).toBe('x-access-token');
      expect(call.env[ASKPASS_PASSWORD_ENV]).toBe(TOKEN);
      expect(call.env['GIT_TERMINAL_PROMPT']).toBe('0'); // askpass stays non-interactive
    }
  });

  it('sets no credential env for a public clone (the B4 behavior is preserved)', async () => {
    const cloner = new GitCloner({ remoteUrl: () => 'https://github.com/acme/public.git' });
    await cloner.clone({
      repo: { host: 'github.com', owner: 'acme', name: 'public' },
      commitSha: 'a'.repeat(40),
      destination: 'unused',
    });

    for (const call of spawnCalls) {
      expect(call.env['GIT_ASKPASS']).toBeUndefined();
      expect(call.env[ASKPASS_PASSWORD_ENV]).toBeUndefined();
    }
  });
});
