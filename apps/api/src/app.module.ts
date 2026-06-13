import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { seconds, ThrottlerModule } from '@nestjs/throttler';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';
import { CoreModule } from './core/core.module';
import { GlobalExceptionFilter } from './core/filters/global-exception.filter';
import { I18nModule } from './i18n/i18n.module';
import { LocaleInterceptor } from './i18n/locale.interceptor';
import { AuthModule } from './modules/auth/auth.module';
import { DatabaseModule } from './modules/database/database.module';
import { GithubModule } from './modules/github/github.module';
import { GraphModule } from './modules/graph/graph.module';
import { HealthModule } from './modules/health/health.module';
import { ProjectModule } from './modules/project/project.module';
import { QueueModule } from './modules/queue/queue.module';
import { UserModule } from './modules/user/user.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';

@Module({
  imports: [
    CoreModule,
    // Per-IP rate limiting for the public edges (webhook receiver, connect
    // flow). Deliberately NOT a global APP_GUARD: the session-guarded graph
    // read API stays unthrottled; exposed controllers opt in with
    // `@UseGuards(ThrottlerGuard)` and a per-route `@Throttle` budget that
    // OVERRIDES this baseline (webhook 120/min, connect 10/min) — this value
    // only governs a future opted-in route that sets no budget of its own.
    // The in-memory counters fit the single-instance self-host topology
    // (ADR-0030); behind a reverse proxy, set TRUST_PROXY so the client IP —
    // not the proxy — is the tracked key.
    ThrottlerModule.forRoot([{ ttl: seconds(60), limit: 60 }]),
    DatabaseModule,
    QueueModule,
    I18nModule,
    AuthModule,
    HealthModule,
    UserModule,
    ProjectModule,
    GraphModule,
    GithubModule,
    WebhooksModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: LocaleInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class AppModule {}
