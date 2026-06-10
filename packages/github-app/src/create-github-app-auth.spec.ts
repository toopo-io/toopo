import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createGithubAppAuth } from './create-github-app-auth';

/** A real PEM so octokit/auth-app construction succeeds; no request is ever made. */
function generatePem(): string {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return privateKey;
}

describe('createGithubAppAuth', () => {
  it('assembles a GithubAppAuth from App credentials without any network call', () => {
    const auth = createGithubAppAuth(
      { appId: 123, privateKey: generatePem() },
      { clock: () => new Date() },
    );

    expect(typeof auth.mintInstallationToken).toBe('function');
    expect(typeof auth.listInstallationRepos).toBe('function');
    expect(typeof auth.resolveDefaultBranchHead).toBe('function');
  });
});
