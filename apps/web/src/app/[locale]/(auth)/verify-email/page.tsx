import { buttonVariants } from '@toopo/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@toopo/ui/components/card';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { routes } from '../../../../lib/routes';
import { VerifyEmailClient } from './verify-email-client';
import { VerifyEmailTokenClient } from './verify-email-token-client';

interface VerifyEmailPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    email?: string;
    verified?: string;
    error?: string;
    token?: string;
  }>;
}

export default async function VerifyEmailPage({
  params,
  searchParams,
}: VerifyEmailPageProps): Promise<ReactNode> {
  const { locale } = await params;
  const { email, verified, error, token } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('Auth.verifyEmail');

  // B13: emails generated post-Phase 4.1.8 embed the frontend URL with the
  // raw token. When present, hand off to the active client that calls
  // /v1/auth/verify-email directly. The legacy `?verified=1` / `?error=`
  // branches below remain for emails generated before B13 — the backend GET
  // endpoint still validates them and 302s into those branches.
  const hasToken = token !== undefined && token.length > 0;
  if (hasToken) {
    return <VerifyEmailTokenClient token={token} />;
  }

  const hasEmail = email !== undefined && email.length > 0;
  const isError = error !== undefined && error.length > 0;
  const isSuccess = verified === '1' && !isError;

  if (isError) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{t('errorTitle')}</CardTitle>
          <CardDescription>{t('errorBody')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {hasEmail ? <VerifyEmailClient email={email} /> : null}
          <p className="text-center text-sm text-muted-foreground">
            <Link href={routes.signin(locale)} className="underline-offset-4 hover:underline">
              {t('backToSignin')}
            </Link>
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isSuccess) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{t('successTitle')}</CardTitle>
          <CardDescription>{t('successMessage')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href={routes.signin(locale)} className={`${buttonVariants()} w-full`}>
            {t('successSigninCta')}
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>
          {hasEmail ? t('pendingMessageWithEmail', { email }) : t('pendingMessage')}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {hasEmail ? <VerifyEmailClient email={email} /> : null}
        <p className="text-center text-sm text-muted-foreground">
          <Link href={routes.signin(locale)} className="underline-offset-4 hover:underline">
            {t('backToSignin')}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
