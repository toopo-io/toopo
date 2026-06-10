import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { resolveWorkerGithubAppAuth } from './worker-github-app';

/** A base64-encoded real PEM so octokit/auth-app construction succeeds (no network). */
function pemBase64(): string {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return Buffer.from(privateKey, 'utf8').toString('base64');
}

describe('resolveWorkerGithubAppAuth', () => {
  it('returns null when the App credentials are unset (public clone only)', () => {
    expect(resolveWorkerGithubAppAuth({})).toBeNull();
  });

  it('returns null when only one of the two credentials is set', () => {
    expect(resolveWorkerGithubAppAuth({ GITHUB_APP_ID: '55' })).toBeNull();
    expect(resolveWorkerGithubAppAuth({ GITHUB_APP_PRIVATE_KEY: pemBase64() })).toBeNull();
  });

  it('treats empty-string credentials as unset', () => {
    expect(
      resolveWorkerGithubAppAuth({ GITHUB_APP_ID: '  ', GITHUB_APP_PRIVATE_KEY: '' }),
    ).toBeNull();
  });

  it('builds an auth instance from valid credentials', () => {
    const auth = resolveWorkerGithubAppAuth({
      GITHUB_APP_ID: '55',
      GITHUB_APP_PRIVATE_KEY: pemBase64(),
    });
    expect(auth).not.toBeNull();
    expect(typeof auth?.mintInstallationToken).toBe('function');
  });
});
