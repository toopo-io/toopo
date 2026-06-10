/**
 * The GitHub-App connect edge (ADR-0026 §2, ADR-0020 thin API). A thin HTTP skin
 * over {@link GithubInstallService}: initiation returns the signed install URL, and
 * the return endpoint completes the install for the session user. Both run behind
 * the SessionGuard — the install is always bound to a signed-in Toopo user, the
 * identity the installation is linked to. No business logic here.
 */
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type CompleteInstallResponse,
  GITHUB_CONNECT_CONTROLLER_PATH,
  GITHUB_INSTALL_COMPLETE_SEGMENT,
  GITHUB_INSTALL_SEGMENT,
  type InstallUrlResponse,
} from '@toopo/api-contracts';
import { ZodSerializerDto } from 'nestjs-zod';
import { CurrentSession } from '../user/current-session.decorator';
import type { CurrentSessionData } from '../user/session.guard';
import { SessionGuard } from '../user/session.guard';
import {
  CompleteInstallRequestDto,
  CompleteInstallResponseDto,
  InstallUrlResponseDto,
} from './github-connect.dto';
import { GithubInstallService } from './github-install.service';

@ApiTags('github')
@Controller({ path: GITHUB_CONNECT_CONTROLLER_PATH, version: '1' })
@UseGuards(SessionGuard)
export class GithubConnectController {
  constructor(private readonly install: GithubInstallService) {}

  @Get(GITHUB_INSTALL_SEGMENT)
  @ApiOperation({
    summary: 'Get the GitHub App install redirect URL (signed, session-bound state)',
  })
  @ZodSerializerDto(InstallUrlResponseDto)
  initiate(@CurrentSession() session: CurrentSessionData): InstallUrlResponse {
    return this.install.buildInstallUrl(session.user.id);
  }

  @Post(GITHUB_INSTALL_COMPLETE_SEGMENT)
  @ApiOperation({
    summary: 'Complete a GitHub App install: link the installation and provision repos',
  })
  @ZodSerializerDto(CompleteInstallResponseDto)
  complete(
    @Body() body: CompleteInstallRequestDto,
    @CurrentSession() session: CurrentSessionData,
  ): Promise<CompleteInstallResponse> {
    return this.install.completeInstall({
      installationId: body.installationId,
      setupAction: body.setupAction,
      state: body.state,
      sessionUserId: session.user.id,
    });
  }
}
