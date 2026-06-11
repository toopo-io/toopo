import { type EmailTemplate, escapeHtml, type InviteParams } from '../types';

export const inviteEn: EmailTemplate<InviteParams> = ({ inviterName, workspaceName, url }) => {
  const safeInviter = escapeHtml(inviterName);
  const safeWorkspace = escapeHtml(workspaceName);
  const subject = `${inviterName} invited you to the ${workspaceName} workspace on Toopo`;
  const text = [
    'Hi,',
    '',
    `${inviterName} has invited you to join the "${workspaceName}" workspace on Toopo.`,
    'Click the link below to accept the invitation.',
    '',
    url,
    '',
    "If you weren't expecting this, you can safely ignore this email.",
    '',
    '— The Toopo team',
  ].join('\n');
  const html = [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1a1a1a;">',
    '<h1 style="font-size: 22px;">You have been invited to a workspace</h1>',
    `<p><strong>${safeInviter}</strong> has invited you to join the <strong>${safeWorkspace}</strong> workspace on Toopo.</p>`,
    `<p><a href="${url}" style="display: inline-block; background: #111; color: #fff; padding: 10px 18px; border-radius: 6px; text-decoration: none;">Accept invitation</a></p>`,
    `<p style="color: #666; font-size: 13px;">Or copy and paste this URL: <br><span style="word-break: break-all;">${url}</span></p>`,
    '<p style="color: #888; font-size: 13px;">If you weren\'t expecting this, you can safely ignore this email.</p>',
    '<p style="color: #888; font-size: 13px;">— The Toopo team</p>',
    '</body></html>',
  ].join('\n');
  return { subject, text, html };
};
