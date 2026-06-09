import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { AUTH_INSTANCE, type Auth } from '../auth/auth.module';
import { UserService } from './user.service';

export interface CurrentSessionData {
  readonly user: {
    readonly id: string;
    readonly email: string;
    readonly name: string;
    readonly emailVerified: boolean;
  };
  readonly session: {
    readonly id: string;
    readonly userId: string;
  };
}

export interface RequestWithSession extends FastifyRequest {
  betterAuthSession?: CurrentSessionData;
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject(AUTH_INSTANCE) private readonly auth: Auth,
    private readonly userService: UserService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithSession>();
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') {
        headers.set(name, value);
      } else if (Array.isArray(value)) {
        headers.set(name, value.join(', '));
      }
    }

    const session = await this.auth.api.getSession({ headers });
    if (session === null) {
      throw new UnauthorizedException('Session required');
    }

    // Defense-in-depth for B10: even though `auth.soft-delete-guard.ts`
    // blocks session creation for soft-deleted users at the Better Auth
    // hook layer, re-check here so a stale-or-leaked session for a
    // soft-deleted user is rejected at the request boundary. The error
    // shape matches the "no session" branch above to avoid leaking the
    // existence of a deleted account.
    const isActive = await this.userService.isActive(session.user.id);
    if (!isActive) {
      throw new UnauthorizedException('Session required');
    }

    req.betterAuthSession = session as CurrentSessionData;
    return true;
  }
}
