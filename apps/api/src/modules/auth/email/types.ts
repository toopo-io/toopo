export interface EmailContent {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

export type EmailTemplate<TParams> = (params: TParams) => EmailContent;

export interface VerifyEmailParams {
  readonly name: string;
  readonly url: string;
}

export interface ResetPasswordParams {
  readonly name: string;
  readonly url: string;
}

export interface InviteParams {
  readonly inviterName: string;
  readonly workspaceName: string;
  readonly url: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
