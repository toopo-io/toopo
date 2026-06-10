/**
 * The public factory (ADR-0026 §4): App credentials in, a {@link GithubAppAuth}
 * out, with the octokit wiring and the token cache assembled behind it. Apps
 * construct this once from their validated env (`appId` from `GITHUB_APP_ID`,
 * `privateKey` from `decodeGithubAppPrivateKey(GITHUB_APP_PRIVATE_KEY)`); when the
 * App is unconfigured they skip construction and fail closed (ADR-0026 §1).
 */
import { CachingGithubAppAuth, type GithubAppAuth } from './caching-github-app-auth.js';
import { createGithubAppClient } from './github-app-client.js';
import { createOctokitFactory, type GithubAppConfig } from './octokit-factory.js';

export interface CreateGithubAppAuthOptions {
  /** Injected clock for the token-refresh boundary. Defaults to `() => new Date()`. */
  readonly clock?: () => Date;
}

export function createGithubAppAuth(
  config: GithubAppConfig,
  options?: CreateGithubAppAuthOptions,
): GithubAppAuth {
  const factory = createOctokitFactory(config);
  const client = createGithubAppClient(factory);
  return new CachingGithubAppAuth(client, options?.clock);
}
