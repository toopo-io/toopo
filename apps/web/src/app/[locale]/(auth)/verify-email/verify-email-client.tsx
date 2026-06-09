'use client';

import { Button } from '@toopo/ui/components/button';
import { useLocale, useTranslations } from 'next-intl';
import { type JSX, useState } from 'react';
import { authClient } from '../../../../lib/auth-client';
import { absoluteRoutes } from '../../../../lib/routes';

interface VerifyEmailClientProps {
  email: string;
}

export function VerifyEmailClient({ email }: VerifyEmailClientProps): JSX.Element {
  const t = useTranslations('Auth.verifyEmail');
  const locale = useLocale();
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [serverError, setServerError] = useState<string | null>(null);

  const handleResend = async (): Promise<void> => {
    setStatus('sending');
    setServerError(null);
    const { error } = await authClient.sendVerificationEmail({
      email,
      callbackURL: absoluteRoutes.verifyEmailDone(window.location.origin, locale),
    });
    if (error !== null && error !== undefined) {
      setStatus('error');
      setServerError(error.message ?? t('errorMessage'));
      return;
    }
    setStatus('sent');
  };

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        onClick={handleResend}
        disabled={status === 'sending'}
      >
        {status === 'sending' ? t('resending') : t('resendButton')}
      </Button>
      {status === 'sent' ? (
        <p className="text-sm text-muted-foreground" role="status">
          {t('resendSuccess')}
        </p>
      ) : null}
      {status === 'error' && serverError !== null ? (
        <p className="text-sm text-destructive" role="alert">
          {serverError}
        </p>
      ) : null}
    </div>
  );
}
