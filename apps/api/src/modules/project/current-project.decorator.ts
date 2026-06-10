import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { ProjectRecord } from '@toopo/db';
import type { RequestWithProject } from './project-access.guard';

/** The project resolved + authorized by {@link ProjectAccessGuard} (ADR-0022 §5). */
export const CurrentProject = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ProjectRecord => {
    const req = ctx.switchToHttp().getRequest<RequestWithProject>();
    if (req.toopoProject === undefined) {
      throw new Error('CurrentProject decorator used without ProjectAccessGuard');
    }
    return req.toopoProject;
  },
);
