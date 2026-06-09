import { Controller, Delete, Get, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { CurrentSession } from './current-session.decorator';
import { type CurrentSessionData, SessionGuard } from './session.guard';
import { UserService } from './user.service';

@Controller({ path: 'user', version: '1' })
@UseGuards(SessionGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('data-export')
  async dataExport(
    @CurrentSession() session: CurrentSessionData,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    // Defense-in-depth for B10. SessionGuard already rejects requests
    // from soft-deleted users, but the export endpoint surfaces full
    // user data, so we re-check at the endpoint boundary to make the
    // soft-delete contract explicit in the controller.
    if (!(await this.userService.isActive(session.user.id))) {
      throw new UnauthorizedException('Session required');
    }
    const data = await this.userService.exportUserData(session.user.id);
    reply
      .header('content-type', 'application/json; charset=utf-8')
      .header('content-disposition', 'attachment; filename="toopo-data-export.json"')
      .send(JSON.stringify(data, null, 2));
  }

  @Delete('me')
  async deleteMe(
    @CurrentSession() session: CurrentSessionData,
  ): Promise<{ ok: true; deletedAt: string }> {
    const { deletedAt } = await this.userService.softDeleteUser(session.user.id);
    return { ok: true, deletedAt: deletedAt.toISOString() };
  }
}
