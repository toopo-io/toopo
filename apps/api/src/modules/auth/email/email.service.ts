import { Injectable } from '@nestjs/common';
import { DEFAULT_LOCALE, type Locale } from '@toopo/i18n';
import { Logger } from 'nestjs-pino';
import { Resend } from 'resend';
import { Env } from '../../../env';
import { inviteEn } from './templates/invite.en';
import { resetPasswordEn } from './templates/reset-password.en';
import { verifyEmailEn } from './templates/verify-email.en';
import type { EmailContent, InviteParams, ResetPasswordParams, VerifyEmailParams } from './types';

const VERIFY_TEMPLATES = {
  en: verifyEmailEn,
} as const;

const RESET_TEMPLATES = {
  en: resetPasswordEn,
} as const;

const INVITE_TEMPLATES = {
  en: inviteEn,
} as const;

interface SendVerificationInput {
  readonly to: string;
  readonly name: string;
  readonly url: string;
  readonly locale: Locale;
}

interface SendResetInput {
  readonly to: string;
  readonly name: string;
  readonly url: string;
  readonly locale: Locale;
}

interface SendInvitationInput {
  readonly to: string;
  readonly inviterName: string;
  readonly workspaceName: string;
  readonly url: string;
  readonly locale: Locale;
}

@Injectable()
export class AuthEmailService {
  private readonly resend: Resend | null;

  constructor(private readonly logger: Logger) {
    this.resend =
      Env.RESEND_API_KEY !== undefined && Env.RESEND_API_KEY.length > 0
        ? new Resend(Env.RESEND_API_KEY)
        : null;
  }

  async sendVerificationEmail(input: SendVerificationInput): Promise<void> {
    const params: VerifyEmailParams = { name: input.name, url: input.url };
    const template = VERIFY_TEMPLATES[input.locale] ?? VERIFY_TEMPLATES[DEFAULT_LOCALE];
    await this.send(input.to, template(params), 'verify-email');
  }

  async sendResetPasswordEmail(input: SendResetInput): Promise<void> {
    const params: ResetPasswordParams = { name: input.name, url: input.url };
    const template = RESET_TEMPLATES[input.locale] ?? RESET_TEMPLATES[DEFAULT_LOCALE];
    await this.send(input.to, template(params), 'reset-password');
  }

  async sendInvitationEmail(input: SendInvitationInput): Promise<void> {
    const params: InviteParams = {
      inviterName: input.inviterName,
      workspaceName: input.workspaceName,
      url: input.url,
    };
    const template = INVITE_TEMPLATES[input.locale] ?? INVITE_TEMPLATES[DEFAULT_LOCALE];
    await this.send(input.to, template(params), 'workspace-invitation');
  }

  private async send(to: string, content: EmailContent, kind: string): Promise<void> {
    if (this.resend === null) {
      this.logger.warn(
        { to, kind, subject: content.subject, fallback: 'logger' },
        'auth: email payload (RESEND_API_KEY not configured)',
      );
      return;
    }

    const result = await this.resend.emails.send({
      from: `${Env.RESEND_FROM_NAME} <${Env.RESEND_FROM_EMAIL}>`,
      to,
      subject: content.subject,
      text: content.text,
      html: content.html,
    });

    if (result.error !== null) {
      this.logger.error({ err: result.error, to, kind }, 'auth: email send failed');
      throw new Error(`Email send failed: ${result.error.message}`);
    }

    this.logger.log({ to, kind, messageId: result.data?.id }, 'auth: email sent');
  }
}
