import { describe, expect, it } from 'vitest';
import { decodeGithubAppPrivateKey, githubAppEnvSchema } from './github-app';

/** Base64-encode a UTF-8 string the way a self-hoster would for the env var. */
function b64(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64');
}

const PEM = '-----BEGIN PRIVATE KEY-----\nMIIBVgIBADANB...\n-----END PRIVATE KEY-----\n';

describe('githubAppEnvSchema', () => {
  it('accepts a fully unset App (every field optional, graceful degradation)', () => {
    const parsed = githubAppEnvSchema.parse({});
    expect(parsed).toEqual({});
  });

  it('coerces GITHUB_APP_ID to a positive integer', () => {
    const parsed = githubAppEnvSchema.parse({ GITHUB_APP_ID: '12345' });
    expect(parsed.GITHUB_APP_ID).toBe(12345);
  });

  it('rejects a non-positive or non-integer App id', () => {
    expect(githubAppEnvSchema.safeParse({ GITHUB_APP_ID: '0' }).success).toBe(false);
    expect(githubAppEnvSchema.safeParse({ GITHUB_APP_ID: '-3' }).success).toBe(false);
    expect(githubAppEnvSchema.safeParse({ GITHUB_APP_ID: '1.5' }).success).toBe(false);
  });

  it('accepts a base64 PEM private key and keeps it as the (still-encoded) string', () => {
    const encoded = b64(PEM);
    const parsed = githubAppEnvSchema.parse({ GITHUB_APP_PRIVATE_KEY: encoded });
    expect(parsed.GITHUB_APP_PRIVATE_KEY).toBe(encoded);
  });

  it('rejects a base64 value that does not decode to a PEM private key', () => {
    const result = githubAppEnvSchema.safeParse({ GITHUB_APP_PRIVATE_KEY: b64('not a key') });
    expect(result.success).toBe(false);
  });

  it('accepts client id, secret, and slug as trimmed non-empty strings', () => {
    const parsed = githubAppEnvSchema.parse({
      GITHUB_APP_CLIENT_ID: 'Iv1.abc',
      GITHUB_APP_CLIENT_SECRET: 'secret-value',
      GITHUB_APP_SLUG: 'toopo-dev',
    });
    expect(parsed.GITHUB_APP_CLIENT_ID).toBe('Iv1.abc');
    expect(parsed.GITHUB_APP_CLIENT_SECRET).toBe('secret-value');
    expect(parsed.GITHUB_APP_SLUG).toBe('toopo-dev');
  });

  it('parses a complete, valid App configuration', () => {
    const encoded = b64(PEM);
    const parsed = githubAppEnvSchema.parse({
      GITHUB_APP_ID: '99',
      GITHUB_APP_PRIVATE_KEY: encoded,
      GITHUB_APP_CLIENT_ID: 'Iv1.abc',
      GITHUB_APP_CLIENT_SECRET: 'secret-value',
      GITHUB_APP_SLUG: 'toopo-dev',
    });
    expect(parsed).toEqual({
      GITHUB_APP_ID: 99,
      GITHUB_APP_PRIVATE_KEY: encoded,
      GITHUB_APP_CLIENT_ID: 'Iv1.abc',
      GITHUB_APP_CLIENT_SECRET: 'secret-value',
      GITHUB_APP_SLUG: 'toopo-dev',
    });
  });
});

describe('decodeGithubAppPrivateKey', () => {
  it('decodes a validated base64 env value back to the original PEM', () => {
    expect(decodeGithubAppPrivateKey(b64(PEM))).toBe(PEM);
  });
});
