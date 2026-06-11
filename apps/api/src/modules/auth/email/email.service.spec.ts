/**
 * AuthEmailService fail-soft contract. With RESEND_API_KEY unset (the default in
 * tests — it is optional in the env schema), the service logs the payload and
 * returns rather than throwing, so a missing email provider can never break an
 * auth or invitation flow (ADR-0011, ADR-0028 Phase 4).
 */
import type { Logger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';
import { AuthEmailService } from './email.service';

function makeLogger(): { logger: Logger; warn: ReturnType<typeof vi.fn> } {
  const warn = vi.fn();
  const logger = { warn, error: vi.fn(), log: vi.fn() } as unknown as Logger;
  return { logger, warn };
}

describe('AuthEmailService.sendInvitationEmail (fail-soft, RESEND_API_KEY unset)', () => {
  it('logs the invitation payload and never throws', async () => {
    const { logger, warn } = makeLogger();
    const service = new AuthEmailService(logger);

    await expect(
      service.sendInvitationEmail({
        to: 'invitee@example.com',
        inviterName: 'Ada',
        workspaceName: 'Acme',
        url: 'https://app.test/en/accept-invitation?id=inv-1',
        locale: 'en',
      }),
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'invitee@example.com', kind: 'workspace-invitation' }),
      expect.stringContaining('email payload'),
    );
  });
});
