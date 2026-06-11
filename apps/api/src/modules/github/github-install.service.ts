/**
 * The GitHub-App install orchestration (ADR-0026 §2–§3, §6): build the signed
 * install redirect, and on return verify the state, link the installation to the
 * session user, and provision its repos (create or revive a project, then enqueue
 * a first scan). `provisionRepos` is the shared seam the installation webhook
 * (B5.4) reuses, so the redirect and the webhook converge on one idempotent path.
 *
 * Fail-closed (ADR-0026 §1): with the App unconfigured the auth port is `null` and
 * every entry point throws `503`. The install hijack defense is the signed,
 * session-bound `state` — a returned state whose user id is not the session user
 * is rejected and NOTHING is linked (ADR-0026 §7).
 */
import {
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { CompleteInstallResponse, InstallUrlResponse } from '@toopo/api-contracts';
import type {
  GithubInstallationRepository,
  MembershipRepository,
  ProjectRepository,
} from '@toopo/db';
import type { GithubAppAuth, InstallationRepo } from '@toopo/github-app';
import type { JobReference, Queue } from '@toopo/queue';
import { Logger } from 'nestjs-pino';
import {
  GITHUB_INSTALLATION_REPOSITORY,
  MEMBERSHIP_REPOSITORY,
  PROJECT_REPOSITORY,
} from '../database/database.module';
import { QUEUE } from '../queue/queue.module';
import { GITHUB_WEBHOOK_HOST } from '../webhooks/github-webhook.constants';
import {
  GITHUB_APP_AUTH,
  GITHUB_APP_SLUG,
  GITHUB_INSTALL_STATE_SECRET,
  type GithubAppAuthProvider,
} from './github.tokens';
import { signInstallState, verifyInstallState } from './install-state';

/** The arguments the connect-return endpoint passes to {@link completeInstall}. */
export interface CompleteInstallArgs {
  readonly installationId: string;
  readonly setupAction: string | undefined;
  readonly state: string;
  readonly sessionUserId: string;
}

@Injectable()
export class GithubInstallService {
  constructor(
    @Inject(GITHUB_APP_AUTH) private readonly auth: GithubAppAuthProvider,
    @Inject(GITHUB_APP_SLUG) private readonly appSlug: string | undefined,
    @Inject(GITHUB_INSTALL_STATE_SECRET) private readonly stateSecret: string,
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(MEMBERSHIP_REPOSITORY) private readonly memberships: MembershipRepository,
    @Inject(GITHUB_INSTALLATION_REPOSITORY)
    private readonly installations: GithubInstallationRepository,
    @Inject(QUEUE) private readonly queue: Queue,
    private readonly logger: Logger,
  ) {}

  /** The install redirect URL with a freshly signed, session-bound state. */
  buildInstallUrl(sessionUserId: string): InstallUrlResponse {
    this.requireConfigured();
    if (this.appSlug === undefined) {
      throw new ServiceUnavailableException('GitHub App is not configured');
    }
    const state = signInstallState(this.stateSecret, sessionUserId, new Date());
    const url = `https://github.com/apps/${this.appSlug}/installations/new?state=${encodeURIComponent(state)}`;
    return { url };
  }

  /** Verify the return, link the installation, and provision its repos. */
  async completeInstall(args: CompleteInstallArgs): Promise<CompleteInstallResponse> {
    const auth = this.requireConfigured();
    const verified = verifyInstallState(this.stateSecret, args.state, new Date());
    if (verified === null || verified.userId !== args.sessionUserId) {
      // Forged / expired / session-mismatched state → link nothing (ADR-0026 §7).
      throw new ForbiddenException('Invalid install state');
    }

    await this.installations.upsertInstallation({
      installationId: args.installationId,
      ownerUserId: args.sessionUserId,
    });

    const installationId = Number(args.installationId);
    const repos = await auth.listInstallationRepos(installationId);
    const projectsConnected = await this.provisionRepos(installationId, args.sessionUserId, repos);
    this.logger.log(
      { installationId: args.installationId, projectsConnected, setupAction: args.setupAction },
      'github app installation completed',
    );
    return { linked: true, projectsConnected };
  }

  /**
   * Create or revive a project per repo and enqueue its first scan. Idempotent and
   * shared with the installation webhook (B5.4): an existing repo (even archived)
   * is revived under the current installation rather than colliding on the unique
   * repo index. Returns the number of repos provisioned.
   */
  async provisionRepos(
    installationId: number,
    ownerUserId: string,
    repos: readonly InstallationRepo[],
  ): Promise<number> {
    const auth = this.requireConfigured();
    // Resolve the owner's memberships ONCE for the whole call (ADR-0028, Phase 2):
    // the ordered list gives both the attribution workspace (its earliest entry —
    // the exact rule `findFirstWorkspaceId` uses) and the membership set for the
    // per-repo re-home check, replacing a per-repo `isMember` round-trip with an
    // in-memory `Set.has`. The owner reached this path through the session guard,
    // which lazily provisions a personal workspace (Phase 1b), so the set is
    // non-empty in practice; an empty set is a genuine invariant breach (we must
    // never fabricate a workspace), so we fail loudly before connecting anything.
    const workspaceIds = await this.memberships.listWorkspaceIds(ownerUserId);
    const workspaceId = workspaceIds[0];
    if (workspaceId === undefined) {
      throw new Error(
        `Cannot connect repositories: owner ${ownerUserId} has no workspace to attribute them to`,
      );
    }
    const memberWorkspaceIds = new Set(workspaceIds);
    for (const repo of repos) {
      await this.provisionRepo(
        auth,
        installationId,
        ownerUserId,
        workspaceId,
        memberWorkspaceIds,
        repo,
      );
    }
    return repos.length;
  }

  /**
   * Soft-archive every project of an installation (ADR-0026 §7) — the
   * `installation.deleted` / `suspend` path. Needs no App auth (project repo
   * only), so it works even if the App later becomes unconfigured. Returns the
   * count archived.
   */
  async archiveInstallationProjects(installationId: string): Promise<number> {
    const projects = await this.projects.findProjectsByInstallationId(installationId);
    const now = new Date();
    for (const project of projects) {
      await this.projects.archiveProject(project.id, now);
    }
    return projects.length;
  }

  /**
   * Soft-archive a single repo's project (ADR-0026 §7) — the
   * `installation_repositories.removed` path. Returns whether a project was found.
   */
  async archiveRepo(owner: string, name: string): Promise<boolean> {
    const project = await this.projects.findProjectByRepo(GITHUB_WEBHOOK_HOST, owner, name);
    if (project === null) {
      return false;
    }
    await this.projects.archiveProject(project.id, new Date());
    return true;
  }

  private async provisionRepo(
    auth: GithubAppAuth,
    installationId: number,
    ownerUserId: string,
    workspaceId: string,
    memberWorkspaceIds: ReadonlySet<string>,
    repo: InstallationRepo,
  ): Promise<void> {
    const installationIdText = String(installationId);
    const existing = await this.projects.findProjectByRepo(
      GITHUB_WEBHOOK_HOST,
      repo.owner,
      repo.name,
    );
    let projectId: string;
    if (existing === null) {
      const created = await this.projects.createProject({
        ownerUserId,
        workspaceId,
        repoHost: GITHUB_WEBHOOK_HOST,
        repoOwner: repo.owner,
        repoName: repo.name,
        installationId: installationIdText,
      });
      projectId = created.id;
    } else {
      // Re-home on revive (ADR-0028): a re-installed project must be reachable by
      // the installing owner. If they are NOT a member of its current workspace
      // (an orphan sentinel, or a workspace they were removed from), re-home it to
      // their resolved workspace; if they ARE a member, leave it — a deliberate
      // placement (e.g. a team workspace via the Phase 5 assign-repo) is respected.
      const member = memberWorkspaceIds.has(existing.workspaceId);
      await this.projects.reviveProject(
        existing.id,
        installationIdText,
        member ? undefined : workspaceId,
      );
      projectId = existing.id;
    }

    const head = await auth.resolveDefaultBranchHead(installationId, repo.owner, repo.name);
    const reference: JobReference = {
      projectId,
      repo: { host: GITHUB_WEBHOOK_HOST, owner: repo.owner, name: repo.name },
      commitSha: head.commitSha,
    };
    await this.queue.enqueue(reference, { dedupeKey: `${projectId}:${head.commitSha}` });
  }

  /** Return the configured auth port, or fail closed with a `503` (ADR-0026 §1). */
  private requireConfigured(): GithubAppAuth {
    if (this.auth === null) {
      throw new ServiceUnavailableException('GitHub App is not configured');
    }
    return this.auth;
  }
}
