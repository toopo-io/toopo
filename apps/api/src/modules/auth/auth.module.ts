import { Module } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { DatabaseService } from '../database/database.module';
import { type Auth, createAuth } from './auth.factory';
import { AuthEmailService } from './email/email.service';

export type { Auth } from './auth.factory';
export const AUTH_INSTANCE = Symbol.for('toopo.auth.instance');

@Module({
  providers: [
    AuthEmailService,
    {
      provide: AUTH_INSTANCE,
      useFactory: (logger: Logger, email: AuthEmailService, database: DatabaseService): Auth =>
        createAuth(logger, email, database),
      inject: [Logger, AuthEmailService, DatabaseService],
    },
  ],
  exports: [AUTH_INSTANCE],
})
export class AuthModule {}
