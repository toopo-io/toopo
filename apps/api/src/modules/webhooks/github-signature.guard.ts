/**
 * The signature gate (ADR-0024 §1). A guard runs before the controller handler,
 * so an unsigned, malformed, or tampered request is rejected before any parse
 * for meaning, project resolve, or enqueue — no work, no cost for a forgery.
 *
 * Failure mapping: secret unset → 503 (fail closed; never accepts unsigned),
 * missing body/signature → 401, signature mismatch → 403. Only the delivery id
 * and event are logged; the body and signature are never logged.
 */
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  type RawBodyRequest,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { Logger } from 'nestjs-pino';
import {
  GITHUB_DELIVERY_HEADER,
  GITHUB_EVENT_HEADER,
  GITHUB_SIGNATURE_HEADER,
  headerValue,
} from './github-headers';
import { verifyGithubSignature } from './github-signature';
import { GITHUB_WEBHOOK_SECRET } from './github-webhook.tokens';

@Injectable()
export class GithubSignatureGuard implements CanActivate {
  constructor(
    @Inject(GITHUB_WEBHOOK_SECRET) private readonly secret: string | undefined,
    private readonly logger: Logger,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RawBodyRequest<FastifyRequest>>();
    const deliveryId = headerValue(request.headers[GITHUB_DELIVERY_HEADER]);
    const event = headerValue(request.headers[GITHUB_EVENT_HEADER]);

    if (this.secret === undefined) {
      // A clear, actionable operator signal (warn level) before the 503 — a
      // self-hoster who has not configured the GitHub App sees exactly what to
      // fix, rather than only the shared filter's generic 5xx error log.
      this.logger.warn(
        { deliveryId, event },
        'GITHUB_WEBHOOK_SECRET not configured — rejecting webhook',
      );
      throw new ServiceUnavailableException('GitHub webhook secret is not configured');
    }

    const { rawBody } = request;
    const signature = headerValue(request.headers[GITHUB_SIGNATURE_HEADER]);
    if (rawBody === undefined || signature === undefined) {
      this.logger.warn({ deliveryId, event }, 'github webhook rejected: missing body or signature');
      throw new UnauthorizedException('Missing webhook signature');
    }

    if (!verifyGithubSignature(rawBody, signature, this.secret)) {
      this.logger.warn({ deliveryId, event }, 'github webhook rejected: invalid signature');
      throw new ForbiddenException('Invalid webhook signature');
    }

    return true;
  }
}
