'use client';

import { buttonVariants } from '@toopo/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@toopo/ui/components/card';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { type JSX, useEffect, useState } from 'react';
import { authClient } from '../../../../lib/auth-client';
import { routes } from '../../../../lib/routes';

type VerifyState = 'verifying' | 'success' | 'error';

interface VerifyEmailTokenClientProps {
  token: string;
}

export function VerifyEmailTokenClient({ token }: VerifyEmailTokenClientProps): JSX.Element {
  const t = useTranslations('Auth.verifyEmail');
  const locale = useLocale();
  const [state, setState] = useState<VerifyState>('verifying');

  useEffect(() => {
    let cancelled = false;
    const run = async (): Promise<void> => {
      const result = await authClient.$fetch('/verify-email', {
        method: 'GET',
        query: { token },
      });
      if (cancelled) {
        return;
      }
      if (result.error !== null && result.error !== undefined) {
        setState('error');
        return;
      }
      setState('success');
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state === 'verifying') {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{t('verifyingTitle')}</CardTitle>
          <CardDescription>{t('verifyingBody')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div role="status" aria-live="polite" className="flex items-center justify-center py-2">
            <span
              aria-hidden
              className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent"
            />
            <span className="sr-only">{t('verifyingTitle')}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (state === 'success') {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{t('successTitle')}</CardTitle>
          <CardDescription>{t('successMessage')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href={routes.signinAfterVerify(locale)} className={`${buttonVariants()} w-full`}>
            {t('successSigninCta')}
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{t('errorTitle')}</CardTitle>
        <CardDescription>{t('errorBody')}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-center text-sm text-muted-foreground">
          <Link href={routes.signin(locale)} className="underline-offset-4 hover:underline">
            {t('backToSignin')}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
