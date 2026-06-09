import { type EmailTemplate, escapeHtml, type ResetPasswordParams } from '../types';

export const resetPasswordEn: EmailTemplate<ResetPasswordParams> = ({ name, url }) => {
  const safeName = escapeHtml(name);
  const subject = 'Reset your Toopo password';
  const text = [
    `Hi ${name},`,
    '',
    'We received a request to reset your Toopo password. Click the link below to set a new one. The link is single-use.',
    '',
    url,
    '',
    "If you didn't request this, you can safely ignore this email — your password will not change.",
    '',
    '— The Toopo team',
  ].join('\n');
  const html = [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1a1a1a;">',
    `<h1 style="font-size: 22px;">Reset your password</h1>`,
    `<p>Hi ${safeName},</p>`,
    '<p>We received a request to reset your Toopo password. Click the link below to set a new one. The link is single-use.</p>',
    `<p><a href="${url}" style="display: inline-block; background: #111; color: #fff; padding: 10px 18px; border-radius: 6px; text-decoration: none;">Reset password</a></p>`,
    `<p style="color: #666; font-size: 13px;">Or copy and paste this URL: <br><span style="word-break: break-all;">${url}</span></p>`,
    '<p style="color: #888; font-size: 13px;">If you didn\'t request this, you can safely ignore this email — your password will not change.</p>',
    '<p style="color: #888; font-size: 13px;">— The Toopo team</p>',
    '</body></html>',
  ].join('\n');
  return { subject, text, html };
};
