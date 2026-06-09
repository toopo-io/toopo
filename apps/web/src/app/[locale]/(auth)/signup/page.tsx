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
import { SignupForm } from './signup-form';

interface SignupPageProps {
  params: Promise<{ locale: string }>;
}

export default async function SignupPage({ params }: SignupPageProps): Promise<ReactNode> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Auth.signup');

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <SignupForm />
        <p className="text-center text-sm text-muted-foreground">
          {t('haveAccount')}{' '}
          <Link
            href={routes.signin(locale)}
            className="font-medium underline-offset-4 hover:underline"
          >
            {t('signinLink')}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
