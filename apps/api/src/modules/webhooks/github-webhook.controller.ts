/**
 * The GitHub push-webhook edge (ADR-0024, ADR-0020 thin API). A thin HTTP skin:
 * the `GithubSignatureGuard` verifies the HMAC before this handler runs, then the
 * handler reads the event/delivery headers and the parsed body and delegates the
 * decision (scope → resolve → enqueue) to the framework-agnostic service. No
 * business logic here. Always responds `200` for a verified delivery; a
 * malformed push payload surfaces as `400` via the global filter.
 */
import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  type RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { ZodSerializerDto } from 'nestjs-zod';
import { GITHUB_DELIVERY_HEADER, GITHUB_EVENT_HEADER, headerValue } from './github-headers';
import { GithubSignatureGuard } from './github-signature.guard';
import { GITHUB_WEBHOOK_ROUTE } from './github-webhook.constants';
import { type GithubWebhookResponse, GithubWebhookResponseDto } from './github-webhook.dto';
import { GithubWebhookService, type WebhookResult } from './github-webhook.service';

/** Project the internal result onto the public acknowledgement envelope. */
function toResponse(result: WebhookResult): GithubWebhookResponse {
  return result.status === 'enqueued'
    ? { status: 'enqueued', deduplicated: result.deduplicated }
    : { status: result.status };
}

@ApiTags('webhooks')
@Controller({ path: GITHUB_WEBHOOK_ROUTE, version: '1' })
export class GithubWebhookController {
  constructor(private readonly service: GithubWebhookService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @UseGuards(GithubSignatureGuard)
  @ApiOperation({
    summary: 'Receive a signature-verified GitHub push webhook and enqueue an ingest job',
  })
  @ZodSerializerDto(GithubWebhookResponseDto)
  async receive(@Req() request: RawBodyRequest<FastifyRequest>): Promise<GithubWebhookResponse> {
    const event = headerValue(request.headers[GITHUB_EVENT_HEADER]);
    const deliveryId = headerValue(request.headers[GITHUB_DELIVERY_HEADER]);
    const result = await this.service.handle(event, deliveryId, request.rawBody);
    return toResponse(result);
  }
}
