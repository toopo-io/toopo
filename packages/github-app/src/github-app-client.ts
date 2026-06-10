/**
 * The GitHub REST seam (ADR-0026 §4). `GithubAppClient` is the narrow port the
 * caching auth layer and the apps depend on; {@link createGithubAppClient} is the
 * octokit-backed implementation that builds the requests and — because every GitHub
 * response is untrusted external input (ADR-0006) — validates each one with Zod
 * before it crosses back into the domain. The octokit instances themselves arrive
 * through an injected {@link OctokitFactory}, so this whole module is tested with a
 * fake octokit (no network, no real App key) while the real wiring stays isolated
 * in `octokit-factory.ts`.
 */
import { z } from 'zod';
import type { DefaultBranchHead, InstallationRepo, InstallationToken } from './types.js';

/** The minimal structural slice of `@octokit/core`'s `Octokit` we depend on. */
export interface OctokitLike {
  request(route: string, params?: Record<string, unknown>): Promise<{ readonly data: unknown }>;
}

/** Builds octokit clients authenticated as the App, or as a given installation. */
export interface OctokitFactory {
  /** App-JWT-authenticated client (mints installation tokens). */
  app(): OctokitLike;
  /** Installation-authenticated client (reads the installation's repos). */
  forInstallation(installationId: number): OctokitLike;
}

/** The GitHub operations the connect flow + worker need (faked in tests). */
export interface GithubAppClient {
  createInstallationToken(installationId: number): Promise<InstallationToken>;
  listInstallationRepos(installationId: number): Promise<readonly InstallationRepo[]>;
  resolveDefaultBranchHead(
    installationId: number,
    owner: string,
    name: string,
  ): Promise<DefaultBranchHead>;
}

/** GitHub's max page size for list endpoints; the repos listing pages by this. */
const REPOS_PER_PAGE = 100;

const InstallationTokenResponseSchema = z.object({
  token: z.string().min(1),
  expires_at: z.string().min(1),
});

const RepositoriesResponseSchema = z.object({
  repositories: z.array(
    z.object({
      name: z.string().min(1),
      owner: z.object({ login: z.string().min(1) }),
    }),
  ),
});

const RepoResponseSchema = z.object({ default_branch: z.string().min(1) });

const BranchResponseSchema = z.object({ commit: z.object({ sha: z.string().min(1) }) });

export function createGithubAppClient(factory: OctokitFactory): GithubAppClient {
  return {
    async createInstallationToken(installationId: number): Promise<InstallationToken> {
      const response = await factory
        .app()
        .request('POST /app/installations/{installation_id}/access_tokens', {
          installation_id: installationId,
        });
      const data = InstallationTokenResponseSchema.parse(response.data);
      return { token: data.token, expiresAt: new Date(data.expires_at) };
    },

    async listInstallationRepos(installationId: number): Promise<readonly InstallationRepo[]> {
      const octokit = factory.forInstallation(installationId);
      const repos: InstallationRepo[] = [];
      for (let page = 1; ; page += 1) {
        const response = await octokit.request('GET /installation/repositories', {
          per_page: REPOS_PER_PAGE,
          page,
        });
        const { repositories } = RepositoriesResponseSchema.parse(response.data);
        for (const repo of repositories) {
          repos.push({ owner: repo.owner.login, name: repo.name });
        }
        if (repositories.length < REPOS_PER_PAGE) {
          break;
        }
      }
      return repos;
    },

    async resolveDefaultBranchHead(
      installationId: number,
      owner: string,
      name: string,
    ): Promise<DefaultBranchHead> {
      const octokit = factory.forInstallation(installationId);
      const repoResponse = await octokit.request('GET /repos/{owner}/{repo}', {
        owner,
        repo: name,
      });
      const { default_branch: defaultBranch } = RepoResponseSchema.parse(repoResponse.data);
      const branchResponse = await octokit.request('GET /repos/{owner}/{repo}/branches/{branch}', {
        owner,
        repo: name,
        branch: defaultBranch,
      });
      const { commit } = BranchResponseSchema.parse(branchResponse.data);
      return { defaultBranch, commitSha: commit.sha };
    },
  };
}
