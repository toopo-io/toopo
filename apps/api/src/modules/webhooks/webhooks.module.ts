/**
 * The GitHub webhook module (ADR-0024). Wires the thin controller, the decision
 * service, and the signature gate, and supplies the webhook secret as a value
 * resolved from validated `Env` — `undefined` when unset, which the gate turns
 * into a fail-closed `503` (a self-host without a GitHub App still boots). The
 * QUEUE and PROJECT_REPOSITORY ports the service injects are provided globally
 * by the queue and database modules.
 */
import { Module } from '@nestjs/common';
import { Env } from '../../env';
import { GithubModule } from '../github/github.module';
import { GithubSignatureGuard } from './github-signature.guard';
import { GithubWebhookController } from './github-webhook.controller';
import { GithubWebhookService } from './github-webhook.service';
import { GITHUB_WEBHOOK_SECRET } from './github-webhook.tokens';

@Module({
  imports: [GithubModule],
  controllers: [GithubWebhookController],
  providers: [
    GithubWebhookService,
    GithubSignatureGuard,
    { provide: GITHUB_WEBHOOK_SECRET, useValue: Env.GITHUB_WEBHOOK_SECRET },
  ],
})
export class WebhooksModule {}
