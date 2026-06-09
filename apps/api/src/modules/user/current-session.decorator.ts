import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { CurrentSessionData, RequestWithSession } from './session.guard';

export const CurrentSession = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentSessionData => {
    const req = ctx.switchToHttp().getRequest<RequestWithSession>();
    if (req.betterAuthSession === undefined) {
      throw new Error('CurrentSession decorator used without SessionGuard');
    }
    return req.betterAuthSession;
  },
);
