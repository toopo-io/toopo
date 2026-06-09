import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@toopo/ui/components/card';
import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { routes } from '../../../lib/routes';
import { getServerSession } from '../../../lib/server-session';
import { AccountActions } from './account-actions';
import { SignOutButton } from './sign-out-button';

interface AccountPageProps {
  params: Promise<{ locale: string }>;
}

export default async function AccountPage({ params }: AccountPageProps): Promise<ReactNode> {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getServerSession();
  if (session === null) {
    redirect(routes.signinNext(locale, routes.account(locale)));
  }
  const t = await getTranslations('Auth.account');
  const { user } = session;
  const createdAt = new Date(user.createdAt);
  const formattedCreatedAt = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(createdAt);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-6 py-12">
      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('subtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-medium text-muted-foreground">{t('nameLabel')}</dt>
              <dd>{user.name}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">{t('emailLabel')}</dt>
              <dd>{user.email}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">{t('emailVerifiedLabel')}</dt>
              <dd>{user.emailVerified ? t('emailVerifiedYes') : t('emailVerifiedNo')}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">{t('memberSinceLabel')}</dt>
              <dd>{formattedCreatedAt}</dd>
            </div>
          </dl>
          <div className="flex justify-end pt-2">
            <SignOutButton />
          </div>
          <AccountActions />
        </CardContent>
      </Card>
    </main>
  );
}
