import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';
import { CoreModule } from './core/core.module';
import { GlobalExceptionFilter } from './core/filters/global-exception.filter';
import { I18nModule } from './i18n/i18n.module';
import { LocaleInterceptor } from './i18n/locale.interceptor';
import { AuthModule } from './modules/auth/auth.module';
import { DatabaseModule } from './modules/database/database.module';
import { GraphModule } from './modules/graph/graph.module';
import { HealthModule } from './modules/health/health.module';
import { UserModule } from './modules/user/user.module';

@Module({
  imports: [
    CoreModule,
    DatabaseModule,
    I18nModule,
    AuthModule,
    HealthModule,
    UserModule,
    GraphModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: LocaleInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class AppModule {}
