import { Module } from '@nestjs/common';
import type { UserRepository } from '@toopo/db';
import { Logger } from 'nestjs-pino';
import { DatabaseService, USER_REPOSITORY } from '../database/database.module';
import { type Auth, createAuth } from './auth.factory';
import { AuthEmailService } from './email/email.service';

export type { Auth } from './auth.factory';
export const AUTH_INSTANCE = Symbol.for('toopo.auth.instance');

@Module({
  providers: [
    AuthEmailService,
    {
      provide: AUTH_INSTANCE,
      useFactory: (
        logger: Logger,
        email: AuthEmailService,
        database: DatabaseService,
        userRepository: UserRepository,
      ): Auth => createAuth(logger, email, database, userRepository),
      inject: [Logger, AuthEmailService, DatabaseService, USER_REPOSITORY],
    },
  ],
  exports: [AUTH_INSTANCE],
})
export class AuthModule {}
