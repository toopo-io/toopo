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
import { Inject, Injectable } from '@nestjs/common';
import type { ProjectRepository } from '@toopo/db';
import type { JobReference, Queue } from '@toopo/queue';
import { PinoLogger } from 'nestjs-pino';
import { PROJECT_REPOSITORY } from '../database/database.module';
import { QUEUE } from '../queue/queue.module';
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

@Injectable()
export class GithubWebhookService {
  constructor(
    @Inject(QUEUE) private readonly queue: Queue,
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(GithubWebhookService.name);
  }

  /**
   * Handle one verified delivery. Non-push events are acknowledged untouched;
   * a push is validated (throws `ZodError` → 400) and routed through the scope,
   * resolve, and enqueue steps.
   */
  async handle(
    event: string | undefined,
    deliveryId: string | undefined,
    body: unknown,
  ): Promise<WebhookResult> {
    if (event !== 'push') {
      return { status: 'acknowledged', reason: `event '${event ?? 'unknown'}' is not a push` };
    }
    const payload = GithubPushEventSchema.parse(body);
    return this.handlePush(payload, deliveryId);
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
      this.logger.info(
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
}
