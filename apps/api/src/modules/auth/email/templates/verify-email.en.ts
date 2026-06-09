import { type EmailTemplate, escapeHtml, type VerifyEmailParams } from '../types';

export const verifyEmailEn: EmailTemplate<VerifyEmailParams> = ({ name, url }) => {
  const safeName = escapeHtml(name);
  const subject = 'Verify your Toopo email';
  const text = [
    `Welcome to Toopo, ${name}!`,
    '',
    'Click the link below to verify your email address. The link is single-use.',
    '',
    url,
    '',
    "If you didn't sign up, you can safely ignore this email.",
    '',
    '— The Toopo team',
  ].join('\n');
  const html = [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1a1a1a;">',
    `<h1 style="font-size: 22px;">Welcome to Toopo, ${safeName}!</h1>`,
    '<p>Click the link below to verify your email address. The link is single-use.</p>',
    `<p><a href="${url}" style="display: inline-block; background: #111; color: #fff; padding: 10px 18px; border-radius: 6px; text-decoration: none;">Verify email</a></p>`,
    `<p style="color: #666; font-size: 13px;">Or copy and paste this URL: <br><span style="word-break: break-all;">${url}</span></p>`,
    '<p style="color: #888; font-size: 13px;">If you didn\'t sign up, you can safely ignore this email.</p>',
    '<p style="color: #888; font-size: 13px;">— The Toopo team</p>',
    '</body></html>',
  ].join('\n');
  return { subject, text, html };
};
