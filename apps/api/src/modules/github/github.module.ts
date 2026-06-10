/**
 * The GitHub-App connect module (ADR-0026). Wires the install controller and
 * orchestration service, and resolves the App credentials from validated `Env`
 * into fail-closed providers (ADR-0026 §1): when the App id or private key is
 * unset, {@link GITHUB_APP_AUTH} is `null` and the connect endpoints return `503`
 * (a self-host without a GitHub App still boots). The private key arrives
 * base64-encoded and is decoded here at construction (fork F5); the install-state
 * secret reuses `BETTER_AUTH_SECRET` (the server's signing key, always present).
 *
 * Exports {@link GithubInstallService} and {@link GITHUB_APP_AUTH} so the webhook
 * module (B5.4) reuses the same provisioning path and auth instance.
 */
import { Module } from '@nestjs/common';
import { decodeGithubAppPrivateKey } from '@toopo/env';
import { createGithubAppAuth } from '@toopo/github-app';
import { Env } from '../../env';
import { UserModule } from '../user/user.module';
import {
  GITHUB_APP_AUTH,
  GITHUB_APP_SLUG,
  GITHUB_INSTALL_STATE_SECRET,
  type GithubAppAuthProvider,
} from './github.tokens';
import { GithubConnectController } from './github-connect.controller';
import { GithubInstallService } from './github-install.service';

/** Build the App-auth port from env, or `null` when unconfigured (fail-closed). */
function resolveGithubAppAuth(): GithubAppAuthProvider {
  if (Env.GITHUB_APP_ID === undefined || Env.GITHUB_APP_PRIVATE_KEY === undefined) {
    return null;
  }
  return createGithubAppAuth({
    appId: Env.GITHUB_APP_ID,
    privateKey: decodeGithubAppPrivateKey(Env.GITHUB_APP_PRIVATE_KEY),
  });
}

@Module({
  imports: [UserModule],
  controllers: [GithubConnectController],
  providers: [
    GithubInstallService,
    { provide: GITHUB_APP_AUTH, useFactory: resolveGithubAppAuth },
    { provide: GITHUB_APP_SLUG, useValue: Env.GITHUB_APP_SLUG },
    { provide: GITHUB_INSTALL_STATE_SECRET, useValue: Env.BETTER_AUTH_SECRET },
  ],
  exports: [GithubInstallService, GITHUB_APP_AUTH],
})
export class GithubModule {}
