/**
 * The webhook acknowledgement envelope (ADR-0024). GitHub ignores the response
 * body, but the API still returns a validated, minimal shape: the handled status
 * and, for an enqueue, whether the queue coalesced a redelivery. Driven by
 * `@ZodSerializerDto`, so the response is validated on the way out (ADR-0006).
 */
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const GithubWebhookResponseSchema = z
  .object({
    status: z.enum(['enqueued', 'ignored', 'acknowledged']),
    deduplicated: z.boolean().optional(),
  })
  .strict();

export type GithubWebhookResponse = z.infer<typeof GithubWebhookResponseSchema>;

export class GithubWebhookResponseDto extends createZodDto(GithubWebhookResponseSchema) {}
