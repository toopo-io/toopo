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
import { SigninForm } from './signin-form';

interface SigninPageProps {
  params: Promise<{ locale: string }>;
}

export default async function SigninPage({ params }: SigninPageProps): Promise<ReactNode> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Auth.signin');

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <SigninForm />
        <div className="flex flex-col gap-2 text-center text-sm text-muted-foreground">
          <Link href={routes.forgotPassword(locale)} className="underline-offset-4 hover:underline">
            {t('forgotLink')}
          </Link>
          <p>
            {t('noAccount')}{' '}
            <Link
              href={routes.signup(locale)}
              className="font-medium underline-offset-4 hover:underline"
            >
              {t('signupLink')}
            </Link>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
