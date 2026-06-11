/**
 * Pins the invitation hook's fail-soft + log-discipline contract (ADR-0028,
 * Phase 4): the accept URL is logged ONLY when email is unconfigured (manual
 * share); when configured it is delivered by email and never logged; a send
 * failure is logged, never thrown.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  createSendInvitationEmail,
  type InvitationEmailData,
  type InvitationHookDeps,
} from './invitation-hook';

const FRONTEND_ORIGIN = 'https://app.test';

const invitation: InvitationEmailData = {
  id: 'inv-123',
  email: 'invitee@example.com',
  organization: { name: 'Acme' },
  inviter: { user: { name: 'Ada' } },
};

function harness(options: { isConfigured: boolean; sendThrows?: boolean }) {
  const sendInvitationEmail = vi.fn((_input: { to: string; url: string }): Promise<void> => {
    if (options.sendThrows === true) {
      return Promise.reject(new Error('provider down'));
    }
    return Promise.resolve();
  });
  const logger = { log: vi.fn(), error: vi.fn() };
  const deps: InvitationHookDeps = {
    email: { sendInvitationEmail, isConfigured: options.isConfigured },
    logger,
    frontendOrigin: FRONTEND_ORIGIN,
  };
  return { hook: createSendInvitationEmail(deps), sendInvitationEmail, logger };
}

describe('createSendInvitationEmail', () => {
  it('sends the email and logs NO accept URL or token when email is configured', async () => {
    const { hook, sendInvitationEmail, logger } = harness({ isConfigured: true });

    await hook(invitation, undefined);

    expect(sendInvitationEmail).toHaveBeenCalledTimes(1);
    const sent = sendInvitationEmail.mock.calls[0]?.[0];
    expect(sent?.url).toContain('inv-123');
    expect(sent?.to).toBe('invitee@example.com');
    // The capability URL/token is delivered by email — never logged.
    expect(logger.log).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('logs the accept URL for manual share only when email is unconfigured', async () => {
    const { hook, sendInvitationEmail, logger } = harness({ isConfigured: false });

    await hook(invitation, undefined);

    // The send is still attempted (it self-handles the no-provider fallback).
    expect(sendInvitationEmail).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalledTimes(1);
    const [payload] = logger.log.mock.calls[0] ?? [];
    expect(payload).toMatchObject({
      event: 'workspace.invitation.created',
      invitationId: 'inv-123',
      to: 'invitee@example.com',
    });
    expect((payload as { acceptUrl: string }).acceptUrl).toContain('inv-123');
  });

  it('logs and swallows a send failure (fail-soft), never throwing', async () => {
    const { hook, logger } = harness({ isConfigured: true, sendThrows: true });

    await expect(hook(invitation, undefined)).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledTimes(1);
    // Still no capability URL logged on the configured path, even on failure.
    expect(logger.log).not.toHaveBeenCalled();
  });
});
