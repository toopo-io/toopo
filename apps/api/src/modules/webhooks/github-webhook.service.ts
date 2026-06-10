/**
 * The webhook decision logic (ADR-0024 §4–§6), framework-agnostic so it is
 * unit-tested over mocked ports. Runs only AFTER the signature gate has passed.
 *
 * Scope: only a `push` whose `ref` is the repository's default branch and is not
 * a delete enqueues. The repo resolves an EXISTING project only (a miss is
 * ignored — B5's install flow owns project creation). The enqueued job is a
 * reference (project + repo coords + commit sha), never the code, deduped by the
 * work unit `${projectId}:${commitSha}` so GitHub's redeliveries coalesce.
 */
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { GithubInstallationRepository, ProjectRepository } from '@toopo/db';
import type { InstallationRepo } from '@toopo/github-app';
import type { JobReference, Queue } from '@toopo/queue';
import { Logger } from 'nestjs-pino';
import { ZodValidationException } from 'nestjs-zod';
import { GITHUB_INSTALLATION_REPOSITORY, PROJECT_REPOSITORY } from '../database/database.module';
import { GithubInstallService } from '../github/github-install.service';
import { QUEUE } from '../queue/queue.module';
import {
  type InstallationEvent,
  InstallationEventSchema,
  type InstallationRepositoriesEvent,
  InstallationRepositoriesEventSchema,
  splitFullName,
} from './github-installation-event.schema';
import { type GithubPushEvent, GithubPushEventSchema } from './github-push-event.schema';
import { GITHUB_WEBHOOK_HOST } from './github-webhook.constants';

/** The handled outcome of a webhook delivery. Every case responds `200`. */
export type WebhookResult =
  | { readonly status: 'enqueued'; readonly deduplicated: boolean }
  | { readonly status: 'ignored'; readonly reason: string }
  | { readonly status: 'acknowledged'; readonly reason: string };

/** True for the all-zero object id GitHub sends when a push deletes a ref. */
function isZeroSha(sha: string): boolean {
  return /^0+$/.test(sha);
}

/**
 * Parse the VERIFIED raw body as JSON (ADR-0024 §4, ADR-0006). Parsing the exact
 * bytes the gate signed — rather than a framework re-parse — keeps the verified
 * and acted-on payloads identical. Malformed JSON or an empty body surfaces as a
 * `400`, never a `500`; the per-event schema parse below does the same on a miss.
 */
function parseJsonBody(rawBody: Buffer | undefined): unknown {
  if (rawBody === undefined || rawBody.length === 0) {
    throw new BadRequestException('Empty webhook payload');
  }
  try {
    return JSON.parse(rawBody.toString('utf8'));
  } catch {
    throw new BadRequestException('Malformed webhook payload (invalid JSON)');
  }
}

function parsePushEvent(rawBody: Buffer | undefined): GithubPushEvent {
  const result = GithubPushEventSchema.safeParse(parseJsonBody(rawBody));
  if (!result.success) {
    throw new ZodValidationException(result.error);
  }
  return result.data;
}

function parseInstallationEvent(rawBody: Buffer | undefined): InstallationEvent {
  const result = InstallationEventSchema.safeParse(parseJsonBody(rawBody));
  if (!result.success) {
    throw new ZodValidationException(result.error);
  }
  return result.data;
}

function parseInstallationReposEvent(rawBody: Buffer | undefined): InstallationRepositoriesEvent {
  const result = InstallationRepositoriesEventSchema.safeParse(parseJsonBody(rawBody));
  if (!result.success) {
    throw new ZodValidationException(result.error);
  }
  return result.data;
}

/** Map GitHub repo refs (`full_name`) to provisioning repos, dropping malformed ones. */
function toInstallationRepos(
  refs: ReadonlyArray<{ readonly full_name: string }>,
): InstallationRepo[] {
  return refs
    .map((ref) => splitFullName(ref.full_name))
    .filter((repo): repo is InstallationRepo => repo !== null);
}

@Injectable()
export class GithubWebhookService {
  constructor(
    @Inject(QUEUE) private readonly queue: Queue,
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(GITHUB_INSTALLATION_REPOSITORY)
    private readonly installations: GithubInstallationRepository,
    private readonly install: GithubInstallService,
    private readonly logger: Logger,
  ) {}

  /**
   * Handle one verified delivery, given the verified raw body. `push` resolves an
   * existing project and enqueues (ADR-0024). `installation` and
   * `installation_repositories` (ADR-0026 §3) create/archive projects via the same
   * provisioning seam the install redirect uses. Every other event is acknowledged
   * untouched. A bad payload for a handled event surfaces as `400`, never `500`.
   */
  async handle(
    event: string | undefined,
    deliveryId: string | undefined,
    rawBody: Buffer | undefined,
  ): Promise<WebhookResult> {
    if (event === 'push') {
      return this.handlePush(parsePushEvent(rawBody), deliveryId);
    }
    if (event === 'installation') {
      return this.handleInstallation(parseInstallationEvent(rawBody), deliveryId);
    }
    if (event === 'installation_repositories') {
      return this.handleInstallationRepositories(parseInstallationReposEvent(rawBody), deliveryId);
    }
    return { status: 'acknowledged', reason: `event '${event ?? 'unknown'}' is not handled` };
  }

  private async handlePush(
    payload: GithubPushEvent,
    deliveryId: string | undefined,
  ): Promise<WebhookResult> {
    const isDefaultBranch = payload.ref === `refs/heads/${payload.repository.default_branch}`;
    const isDelete = payload.deleted === true || isZeroSha(payload.after);
    if (!isDefaultBranch || isDelete) {
      return { status: 'ignored', reason: 'not a commit to the default branch' };
    }

    const owner = payload.repository.owner.login;
    const name = payload.repository.name;
    const project = await this.projects.findProjectByRepo(GITHUB_WEBHOOK_HOST, owner, name);
    if (project === null) {
      this.logger.log(
        { deliveryId, host: GITHUB_WEBHOOK_HOST, owner, name },
        'github webhook ignored: repository is not connected to a project',
      );
      return { status: 'ignored', reason: 'repository is not connected to a project' };
    }

    const reference: JobReference = {
      projectId: project.id,
      repo: { host: GITHUB_WEBHOOK_HOST, owner, name },
      commitSha: payload.after,
    };
    const outcome = await this.queue.enqueue(reference, {
      dedupeKey: `${project.id}:${payload.after}`,
    });
    return { status: 'enqueued', deduplicated: outcome.deduplicated };
  }

  /**
   * `installation` lifecycle (ADR-0026 §3): created / unsuspend (re)provision the
   * granted repos; deleted / suspend archive the installation's projects (deleted
   * also drops the link). Every other action is acknowledged untouched.
   */
  private async handleInstallation(
    payload: InstallationEvent,
    deliveryId: string | undefined,
  ): Promise<WebhookResult> {
    const installationId = String(payload.installation.id);
    if (payload.action === 'deleted' || payload.action === 'suspend') {
      const archived = await this.install.archiveInstallationProjects(installationId);
      if (payload.action === 'deleted') {
        await this.installations.deleteInstallation(installationId);
      }
      this.logger.log(
        { deliveryId, installationId, action: payload.action, archived },
        'github installation archived',
      );
      return { status: 'acknowledged', reason: `installation ${payload.action}` };
    }
    if (payload.action === 'created' || payload.action === 'unsuspend') {
      return this.provisionForInstallation(installationId, payload.repositories ?? [], deliveryId);
    }
    return {
      status: 'acknowledged',
      reason: `installation action '${payload.action}' not handled`,
    };
  }

  /**
   * `installation_repositories` (ADR-0026 §3): `added` provisions the new repos,
   * `removed` soft-archives them. `added` resolves the owner from the link and
   * never fabricates one; `removed` archives by repo and needs no link.
   */
  private async handleInstallationRepositories(
    payload: InstallationRepositoriesEvent,
    deliveryId: string | undefined,
  ): Promise<WebhookResult> {
    const installationId = String(payload.installation.id);
    if (payload.action === 'added') {
      return this.provisionForInstallation(
        installationId,
        payload.repositories_added ?? [],
        deliveryId,
      );
    }
    if (payload.action === 'removed') {
      let archived = 0;
      for (const repo of toInstallationRepos(payload.repositories_removed ?? [])) {
        if (await this.install.archiveRepo(repo.owner, repo.name)) {
          archived += 1;
        }
      }
      this.logger.log(
        { deliveryId, installationId, archived },
        'github installation repositories removed',
      );
      return { status: 'acknowledged', reason: `archived ${archived} repositories` };
    }
    return {
      status: 'acknowledged',
      reason: `repositories action '${payload.action}' not handled`,
    };
  }

  /**
   * The shared create-side path: resolve the installation's owner from the link
   * (the only user-bearing signal) and provision the repos. A webhook for an
   * UNLINKED installation acks `ignored` and creates nothing — never fabricate an
   * owner (ADR-0026 §3, symmetric to ADR-0024's resolve-existing-only).
   */
  private async provisionForInstallation(
    installationId: string,
    refs: ReadonlyArray<{ readonly full_name: string }>,
    deliveryId: string | undefined,
  ): Promise<WebhookResult> {
    const link = await this.installations.findInstallation(installationId);
    if (link === null) {
      this.logger.log(
        { deliveryId, installationId },
        'github installation webhook ignored: installation is not linked to a user',
      );
      return { status: 'ignored', reason: 'installation is not linked to a user' };
    }
    const repos = toInstallationRepos(refs);
    const provisioned = await this.install.provisionRepos(
      Number(installationId),
      link.ownerUserId,
      repos,
    );
    this.logger.log(
      { deliveryId, installationId, provisioned },
      'github installation repositories provisioned',
    );
    return { status: 'acknowledged', reason: `provisioned ${provisioned} repositories` };
  }
}
