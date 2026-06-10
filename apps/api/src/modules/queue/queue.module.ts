/**
 * Owns the single shared job-queue producer for the API (ADR-0023, ADR-0024).
 * Everything comes from @toopo/queue's surface — `createQueue` selects the
 * backend (SQLite self-host / Postgres cloud) from the DATABASE_URL scheme, the
 * same way @toopo/db does — so apps/api never names the storage engine. The API
 * only ever produces (the B3 webhook enqueues); the consumer is the worker (B4).
 *
 * The `job` table is migrated globally by `db:migrate` (0006_job), never on boot
 * (ADR-0008); constructing the handle opens no query, so boot stays cheap.
 */
import { Global, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import { createQueue, type Queue, type QueueHandle } from '@toopo/queue';
import { Env } from '../../env';

/** DI token for the producer-facing {@link Queue} (the webhook enqueues here). */
export const QUEUE = Symbol.for('toopo.queue');

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly handle: QueueHandle;

  constructor() {
    this.handle = createQueue({ databaseUrl: Env.DATABASE_URL });
  }

  /** The producer surface — the only queue capability the API needs. */
  get queue(): Queue {
    return this.handle.queue;
  }

  async onModuleDestroy(): Promise<void> {
    await this.handle.close();
  }
}

@Global()
@Module({
  providers: [
    QueueService,
    {
      provide: QUEUE,
      useFactory: (service: QueueService): Queue => service.queue,
      inject: [QueueService],
    },
  ],
  exports: [QUEUE],
})
export class QueueModule {}
