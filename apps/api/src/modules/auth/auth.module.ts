import { Module } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { type Auth, createAuth } from './auth.factory';
import { AuthEmailService } from './email/email.service';

export type { Auth } from './auth.factory';
export const AUTH_INSTANCE = Symbol.for('toopo.auth.instance');

@Module({
  providers: [
    AuthEmailService,
    {
      provide: AUTH_INSTANCE,
      useFactory: (logger: Logger, email: AuthEmailService): Auth => createAuth(logger, email),
      inject: [Logger, AuthEmailService],
    },
  ],
  exports: [AUTH_INSTANCE],
})
export class AuthModule {}
