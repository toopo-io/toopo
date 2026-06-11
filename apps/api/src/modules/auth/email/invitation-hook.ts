/**
 * The workspace-invitation email hook (ADR-0028, Phase 4), extracted from the
 * auth factory so its fail-soft + log-discipline contract is unit-tested in
 * isolation (mirroring `createEnsureActiveWorkspace` / the soft-delete guard).
 *
 * Log discipline (security/privacy): the accept URL is a capability — anyone
 * holding it can accept the invitation on the invitee's behalf. It is logged
 * ONLY when no email provider is configured (the self-host manual-share
 * fallback). When email IS configured the URL is delivered by email, so logging
 * it next to the recipient address would leak an accept-on-behalf capability into
 * plaintext logs — we never do.
 */
import { negotiateLocale } from '@toopo/i18n';
import type { Logger } from 'nestjs-pino';
import type { AuthEmailService } from './email.service';
import { buildAcceptInvitationUrl } from './url-builders';

/** The subset of Better Auth's invitation payload the hook consumes. */
export interface InvitationEmailData {
  readonly id: string;
  readonly email: string;
  readonly organization: { readonly name: string };
  readonly inviter: { readonly user: { readonly name: string } };
}

/** The inbound request (used only for locale negotiation); absent off-request. */
export type InvitationEmailRequest = { readonly headers: Headers } | undefined;

export interface InvitationHookDeps {
  readonly email: Pick<AuthEmailService, 'sendInvitationEmail' | 'isConfigured'>;
  readonly logger: Pick<Logger, 'log' | 'error'>;
  readonly frontendOrigin: string;
}

export function createSendInvitationEmail(
  deps: InvitationHookDeps,
): (data: InvitationEmailData, request: InvitationEmailRequest) => Promise<void> {
  const { email, logger, frontendOrigin } = deps;
  return async (data, request) => {
    const locale = negotiateLocale(request?.headers.get('accept-language') ?? null, {
      override: request?.headers.get('x-toopo-locale') ?? null,
    });
    const acceptUrl = buildAcceptInvitationUrl({ invitationId: data.id, locale, frontendOrigin });
    try {
      await email.sendInvitationEmail({
        to: data.email,
        inviterName: data.inviter.user.name,
        workspaceName: data.organization.name,
        url: acceptUrl,
        locale,
      });
    } catch (error) {
      // Fail-soft: a send failure is logged, never thrown — it must not break the
      // invitation write (the invitee can be re-invited).
      logger.error({ err: error, to: data.email }, 'workspace: invitation send failed');
    }
    if (!email.isConfigured) {
      // Manual-share fallback only — see the log-discipline note above.
      logger.log(
        { event: 'workspace.invitation.created', invitationId: data.id, to: data.email, acceptUrl },
        'workspace: invitation created (email not configured — share this URL manually)',
      );
    }
  };
}
