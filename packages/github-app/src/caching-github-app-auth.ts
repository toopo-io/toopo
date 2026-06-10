/**
 * The public GitHub-App auth port (ADR-0026 §4–§5) and its caching implementation.
 * Installation tokens are short-lived (~1h) and the worker mints one per job, so a
 * naive port would hit GitHub on every push; {@link CachingGithubAppAuth} caches
 * the token per installation and re-mints only when it is within
 * {@link TOKEN_REFRESH_MARGIN_MS} of expiry. The clock is injected (no hidden
 * `Date.now`), so the refresh boundary is pinned and asserted in tests — the same
 * determinism discipline the queue's backoff uses. Repo listing and HEAD resolution
 * are pass-throughs (called only at connect time, not worth caching).
 */
import type { GithubAppClient } from './github-app-client.js';
import type { DefaultBranchHead, InstallationRepo, InstallationToken } from './types.js';

/** Re-mint a cached token once it is this close to expiry (guards clock skew + RTT). */
export const TOKEN_REFRESH_MARGIN_MS = 60_000;

/** The installation-token + repo-reading operations the apps and worker consume. */
export interface GithubAppAuth {
  /** A valid installation token, served from cache until near expiry (ADR-0026 §5). */
  mintInstallationToken(installationId: number): Promise<InstallationToken>;
  /** Every repo the installation grants (the authoritative connect-time list). */
  listInstallationRepos(installationId: number): Promise<readonly InstallationRepo[]>;
  /** The repo's default branch + its HEAD sha, for the first-scan enqueue. */
  resolveDefaultBranchHead(
    installationId: number,
    owner: string,
    name: string,
  ): Promise<DefaultBranchHead>;
}

export class CachingGithubAppAuth implements GithubAppAuth {
  private readonly tokenCache = new Map<number, InstallationToken>();

  constructor(
    private readonly client: GithubAppClient,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async mintInstallationToken(installationId: number): Promise<InstallationToken> {
    const cached = this.tokenCache.get(installationId);
    if (cached !== undefined && !this.isExpiring(cached)) {
      return cached;
    }
    const fresh = await this.client.createInstallationToken(installationId);
    this.tokenCache.set(installationId, fresh);
    return fresh;
  }

  listInstallationRepos(installationId: number): Promise<readonly InstallationRepo[]> {
    return this.client.listInstallationRepos(installationId);
  }

  resolveDefaultBranchHead(
    installationId: number,
    owner: string,
    name: string,
  ): Promise<DefaultBranchHead> {
    return this.client.resolveDefaultBranchHead(installationId, owner, name);
  }

  /** True when the token expires within the refresh margin of the injected now. */
  private isExpiring(token: InstallationToken): boolean {
    return token.expiresAt.getTime() - this.clock().getTime() <= TOKEN_REFRESH_MARGIN_MS;
  }
}
