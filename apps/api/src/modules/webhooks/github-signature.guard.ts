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
import { PinoLogger } from 'nestjs-pino';
import { verifyGithubSignature } from './github-signature';
import { GITHUB_WEBHOOK_SECRET } from './github-webhook.tokens';

/** A single-valued header, or `undefined` for an absent or multi-valued one. */
function headerValue(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

@Injectable()
export class GithubSignatureGuard implements CanActivate {
  constructor(
    @Inject(GITHUB_WEBHOOK_SECRET) private readonly secret: string | undefined,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(GithubSignatureGuard.name);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RawBodyRequest<FastifyRequest>>();
    const deliveryId = headerValue(request.headers['x-github-delivery']);
    const event = headerValue(request.headers['x-github-event']);

    if (this.secret === undefined) {
      this.logger.warn({ deliveryId, event }, 'github webhook rejected: secret not configured');
      throw new ServiceUnavailableException('GitHub webhook secret is not configured');
    }

    const { rawBody } = request;
    const signature = headerValue(request.headers['x-hub-signature-256']);
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
